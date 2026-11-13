/**
 * @vaultguard/crypto — Argon2id KDF, Bounds Validation & FIFO Serial Queue (`kdf.ts`)
 * Locked to ENVELOPE_SPEC.md v2 §4.1, ARCHITECTURE.md v3.1 & ADR-004
 * Enforces OWASP Minimum Floor: 19456 KiB (19 MiB) <= m <= 65536 KiB (64 MiB)
 *
 * Mobile JSI Upgrade:
 * - Uses `standardnotes/react-native-sodium-jsi` zero-copy C++ JSI bindings on React Native
 *   (ARM64 NEON SIMD instructions, executing Argon2id `m=19456 KiB, t=2, p=1` in < 200ms).
 * - `await sodium.ready` is synchronous/instant under JSI.
 * - Intermediate `masterSeed` is unconditionally wiped via `sodium.memzero()` in `finally`.
 */

import { argon2id as wasmArgon2id } from 'hash-wasm';
import { argon2idAsync as nobleArgon2idAsync } from '@noble/hashes/argon2';
import sodium from 'libsodium-wrappers-sumo';
import {
  KDF_MEMORY_MIN_KIB,
  KDF_MEMORY_MAX_KIB,
  KDF_TIME_COST_MIN,
  KDF_TIME_COST,
  KDF_TIME_COST_MAX,
  KDF_PARALLELISM_MIN,
  KDF_PARALLELISM,
  KDF_PARALLELISM_MAX,
  WORKER_MAX_QUEUE_DEPTH,
  KEK_ID,
  BLAKE2B_CTX_MASTER_KEK,
  SALT_BYTES,
  DEK_BYTES,
  MAX_BACKOFF_SECONDS,
  VaultGuardError,
  KdfParams,
} from '@vaultguard/shared';

export const OWASP_MIN_MEMORY_KIB = 19456; // 19 MiB OWASP Floor (KDF_MEMORY_MIN_KIB)
export const WORKER_MAX_MEMORY_KIB = 65536; // 64 MiB Worker Ceiling (KDF_MEMORY_MAX_KIB)

export const DEFAULT_DESKTOP_KDF_PARAMS: KdfParams = {
  m: KDF_MEMORY_MAX_KIB, // 65536 KiB (64 MiB)
  t: KDF_TIME_COST, // 3
  p: KDF_PARALLELISM, // 4
};

/**
 * OWASP Mobile Argon2id Profile:
 * m = 19456 KiB (19 MiB), t = 2, p = 1.
 * Executes in < 200ms on physical devices via native C++ JSI (ARM64 NEON).
 */
export const OWASP_MOBILE_KDF_PARAMS: KdfParams = {
  m: KDF_MEMORY_MIN_KIB, // 19456 KiB (19 MiB OWASP minimum floor)
  t: KDF_TIME_COST_MIN, // 2
  p: KDF_PARALLELISM_MIN, // 1
};

function resolveSodium(): any {
  const g = typeof globalThis !== 'undefined' ? (globalThis as any) : {};
  if (g.__SodiumJSI) {
    return g.__SodiumJSI;
  }
  const isRN =
    (typeof navigator !== 'undefined' && (navigator as any).product === 'ReactNative') ||
    g.nativeCallSyncHook !== undefined ||
    g.HermesInternal !== undefined;
  if (isRN) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const jsiMod = require('react-native-sodium-jsi');
      return jsiMod?.default ?? jsiMod;
    } catch {
      // Fallback to Metro-aliased sodium module
    }
  }
  return sodium;
}

/**
 * Enforces two-sided Argon2id KDF parameter bounds:
 * - Memory floor: 19456 KiB (19 MiB OWASP minimum)
 * - Memory ceiling: 65536 KiB (64 MiB Worker WASM cap)
 * - Iterations: 2 <= t <= 10
 * - Parallelism: 1 <= p <= 4
 */
export function assertValidKdfParams(params: KdfParams): void {
  if (typeof params !== 'object' || params === null) {
    throw new Error('KDF_INVALID_PARAMS_OBJECT');
  }
  const { m, t, p } = params;
  if (!Number.isInteger(m) || !Number.isInteger(t) || !Number.isInteger(p)) {
    throw new Error('KDF_NON_INTEGER_PARAMS');
  }
  if (m < OWASP_MIN_MEMORY_KIB || m < KDF_MEMORY_MIN_KIB || t < KDF_TIME_COST_MIN || p < KDF_PARALLELISM_MIN) {
    throw new Error('KDF_BELOW_OWASP_FLOOR');
  }
  if (m > WORKER_MAX_MEMORY_KIB || m > KDF_MEMORY_MAX_KIB || t > KDF_TIME_COST_MAX || p > KDF_PARALLELISM_MAX) {
    throw new Error('KDF_EXCEEDS_WORKER_MEMORY_CEILING');
  }
}

/**
 * Single-concurrency FIFO queue (concurrency = 1, maxDepth = 4) that serializes
 * Argon2id allocations. A 5th queued item immediately rejects with ERR_WORKER_QUEUE_OVERFLOW.
 */
export class WorkerSerialQueue {
  private active = false;
  private queue: Array<() => Promise<void>> = [];
  public readonly maxDepth: number;

  constructor(maxDepth: number = WORKER_MAX_QUEUE_DEPTH) {
    this.maxDepth = maxDepth;
  }

  get pendingCount(): number {
    return this.queue.length;
  }

  get isBusy(): boolean {
    return this.active;
  }

  enqueue<T>(operation: () => Promise<T>): Promise<T> {
    if (this.queue.length >= this.maxDepth) {
      return Promise.reject(new VaultGuardError('ERR_WORKER_QUEUE_OVERFLOW'));
    }
    return new Promise<T>((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await operation();
          resolve(result);
        } catch (err) {
          reject(err);
        }
      });
      void this.drain();
    });
  }

  private async drain(): Promise<void> {
    if (this.active) {
      return;
    }
    const nextJob = this.queue.shift();
    if (!nextJob) {
      return;
    }
    this.active = true;
    try {
      await nextJob();
    } finally {
      this.active = false;
      if (this.queue.length > 0) {
        void this.drain();
      }
    }
  }
}

export const defaultKdfQueue = new WorkerSerialQueue(WORKER_MAX_QUEUE_DEPTH);

/**
 * Derives a 32-byte MasterKEK from a password Uint8Array and 16-byte salt using
 * native C++ JSI `crypto_pwhash` (Argon2id13) on mobile (or hash-wasm on desktop)
 * followed by Libsodium BLAKE2b subkey derivation ("VG_KEK_1", ID=1).
 * Starts with `await sodium.ready` (synchronous/instant in JSI) and zeroes intermediate
 * `masterSeed` via `sodium.memzero()` in `finally`.
 */
export async function deriveMasterKEK(
  password: Uint8Array,
  salt: Uint8Array,
  params: KdfParams = DEFAULT_DESKTOP_KDF_PARAMS
): Promise<Uint8Array> {
  const activeSodium = resolveSodium();
  if (activeSodium.ready) {
    await activeSodium.ready;
  }
  if (!(password instanceof Uint8Array) || password.byteLength === 0) {
    throw new Error('KDF_EMPTY_PASSWORD');
  }
  if (!(salt instanceof Uint8Array) || salt.byteLength !== SALT_BYTES) {
    throw new Error('KDF_INVALID_SALT_LENGTH');
  }
  assertValidKdfParams(params);
  return defaultKdfQueue.enqueue(async () => {
    let masterSeed: Uint8Array | null = null;
    try {
      const isReactNative =
        (typeof navigator !== 'undefined' && (navigator as any).product === 'ReactNative') ||
        (typeof globalThis !== 'undefined' &&
          ((globalThis as any).nativeCallSyncHook !== undefined ||
            (globalThis as any).HermesInternal !== undefined ||
            (globalThis as any).__SodiumJSI !== undefined));

      // 1. Primary Native C++ JSI / Android ART / Libsodium path (`crypto_pwhash` Argon2id13)
      // On React Native, executes native ARM64 instructions in < 150ms.
      if (typeof activeSodium.crypto_pwhash_async === 'function' && (isReactNative || params.p === 1)) {
        try {
          const alg = activeSodium.crypto_pwhash_ALG_ARGON2ID13 ?? 2;
          masterSeed = await activeSodium.crypto_pwhash_async(
            DEK_BYTES,
            password,
            salt,
            params.t,
            params.m * 1024,
            alg
          );
        } catch {
          // Fallback to sync or next stage
        }
      }

      if (!masterSeed && typeof activeSodium.crypto_pwhash === 'function' && (isReactNative || params.p === 1)) {
        try {
          const alg = activeSodium.crypto_pwhash_ALG_ARGON2ID13 ?? 2;
          masterSeed = activeSodium.crypto_pwhash(
            DEK_BYTES,
            password,
            salt,
            params.t,
            params.m * 1024,
            alg
          );
        } catch {
          // Fallback if native JSI HostObject is not present in unit test environment
        }
      }

      // 2. Desktop Browser Extension WebAssembly path (when p > 1 on Desktop)
      if (!masterSeed && typeof WebAssembly !== 'undefined' && !isReactNative) {
        try {
          masterSeed = await wasmArgon2id({
            password,
            salt,
            memorySize: params.m,
            iterations: params.t,
            parallelism: params.p,
            hashLength: DEK_BYTES,
            outputType: 'binary',
          });
        } catch {
          // Fallback to noble-hashes if WASM execution is restricted
        }
      }

      // 3. Last-resort fallback for non-JSI test environments
      if (!masterSeed) {
        masterSeed = await nobleArgon2idAsync(password, salt, {
          t: params.t,
          m: params.m,
          p: params.p,
          dkLen: DEK_BYTES,
          asyncTick: 16,
        } as any);
      }

      const masterKek = activeSodium.crypto_kdf_derive_from_key(
        DEK_BYTES,
        KEK_ID,
        BLAKE2B_CTX_MASTER_KEK,
        masterSeed
      );
      return masterKek;
    } finally {
      if (masterSeed) {
        activeSodium.memzero(masterSeed);
      }
    }
  });
}

/**
 * Client-side exponential backoff calculator (Finding 8 Fix):
 * 1s, 2s, 4s, 8s, 16s, 32s, capped at 60s.
 */
export function computeBackoffDelayMs(failedAttempts: number): number {
  if (!Number.isInteger(failedAttempts) || failedAttempts <= 0) {
    return 0;
  }
  const delaySec = Math.min(MAX_BACKOFF_SECONDS, Math.pow(2, failedAttempts - 1));
  return delaySec * 1000;
}
