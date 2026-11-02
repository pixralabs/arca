/**
 * @vaultguard/crypto — One-Time Ephemeral Sharing (`secureShare.ts`)
 *
 * Security Architecture:
 * - Every async function starts with `await sodium.ready;` on its very first line.
 * - Sender generates a random 256-bit `shareKey = sodium.randombytes_buf(32)`.
 * - Derives a one-way cryptographic `burnToken` from `shareKey` via keyed BLAKE2b-256
 *   (`deriveShareBurnToken(shareKey)` over domain string `"VG_SHARE_BURN_TOKEN_V1"`).
 * - The item payload (`username`, `password`, `url`, optional `title`) is padded to 256 bytes
 *   (`padTo256`) and encrypted with `shareKey` using `XChaCha20-Poly1305-IETF` (`24`-byte nonce,
 *   canonical AAD `"vaultguard:v1:share:<shareId>"`).
 * - The ciphertext and `burnToken` are uploaded to `POST /v1/share/create` (`maxViews = 1`, `expiresAt = now + 5m`).
 *   The server NEVER receives `shareKey`.
 * - The share link formats both `shareId` and `shareKeyBase64` inside the URL fragment:
 *   `https://share.vaultguard.dev/#<shareId>:<shareKeyBase64>`
 * - Strict One-Time & 5-Minute Expiration:
 *   - Share links are deleted (burned) after the first view OR after 5 minutes (300,000 ms), whichever comes first.
 * - All transient key and plaintext buffers (`shareKey`, `padded`, `plaintextBytes`) are wiped
 *   via `sodium.memzero()` inside `finally` blocks.
 */

import sodium from 'libsodium-wrappers-sumo';
import { DEK_BYTES, AEAD_NONCE_BYTES, AEAD_TAG_BYTES } from '@vaultguard/shared';
import { padTo256, unpadFrom256 } from './padding.js';

export const DEFAULT_SHARE_BASE_URL = 'https://share.vaultguard.dev';
export const DEFAULT_SHARE_RELAY_URL = 'https://sync.vaultguard.dev';
export const DEFAULT_SHARE_TTL_MS = 300_000; // 5 minutes (300,000 ms)
export const MAX_SHARE_TTL_MS = 300_000; // 5 minutes hard ceiling
export const AAD_SHARE_PREFIX = 'vaultguard:v1:share:';
export const SHARE_BURN_TOKEN_CONTEXT = 'VG_SHARE_BURN_TOKEN_V1';

export interface EphemeralSharePayload {
  username?: string;
  password?: string;
  url?: string;
  title?: string;
  [key: string]: unknown;
}

export interface EphemeralShareOptions {
  shareId?: string;
  ttlMs?: number;
  shareBaseUrl?: string;
  relayServerUrl?: string;
  transport?: (req: {
    method: string;
    url: string;
    headers?: Record<string, string>;
    body?: string;
  }) => Promise<{ ok: boolean; status: number; bodyText: string }>;
}

export interface CreatedEphemeralShare {
  shareId: string;
  shareKeyBase64: string;
  burnToken: string;
  url: string;
  encryptedPayload: string;
  expiresAt: number;
}

export interface ParsedShareUrl {
  shareId?: string;
  shareKeyBase64: string;
}

// Local ephemeral fallback store when no remote HTTP transport is injected
const inMemoryShareRelayStore = new Map<
  string,
  {
    encryptedPayload: string;
    burnToken: string;
    expiresAt: number;
    viewCount: number;
    maxViews: number;
  }
>();

export function buildShareAad(shareId: string): string {
  if (typeof shareId !== 'string' || shareId.trim().length === 0) {
    throw new Error('ERR_SHARE_INVALID_ID');
  }
  return `${AAD_SHARE_PREFIX}${shareId.trim()}`;
}

/**
 * Derives a deterministic, one-way 64-hex-character `burnToken` from the 32-byte `shareKey`
 * using keyed BLAKE2b-256 (`sodium.crypto_generichash(32, "VG_SHARE_BURN_TOKEN_V1", shareKey)`).
 */
export async function deriveShareBurnToken(shareKey: Uint8Array): Promise<string> {
  await sodium.ready;
  if (!(shareKey instanceof Uint8Array) || shareKey.byteLength !== DEK_BYTES) {
    throw new Error('ERR_SHARE_INVALID_KEY_LENGTH');
  }
  const workingKey = new Uint8Array(shareKey);
  try {
    const contextBytes = sodium.from_string(SHARE_BURN_TOKEN_CONTEXT);
    const tokenBytes = sodium.crypto_generichash(32, contextBytes, workingKey);
    const tokenHex = sodium.to_hex(tokenBytes);
    sodium.memzero(tokenBytes);
    return tokenHex;
  } finally {
    sodium.memzero(workingKey);
  }
}

/**
 * Extracts `shareId` and `shareKeyBase64` from `https://share.vaultguard.dev/#<shareId>:<shareKeyBase64>`.
 */
export function parseShareUrlFragment(urlOrHash: string): ParsedShareUrl {
  if (typeof urlOrHash !== 'string' || urlOrHash.trim().length === 0) {
    throw new Error('ERR_SHARE_EMPTY_FRAGMENT');
  }
  const trimmed = urlOrHash.trim();
  let hashPart = trimmed;
  let queryShareId: string | undefined;

  if (trimmed.includes('#')) {
    const hashIdx = trimmed.indexOf('#');
    hashPart = trimmed.slice(hashIdx + 1);
    try {
      const parsedUrl = new URL(trimmed.slice(0, hashIdx));
      const idParam = parsedUrl.searchParams.get('id');
      if (idParam) {
        queryShareId = idParam;
      }
    } catch {
      // Fragment-only string
    }
  } else if (trimmed.startsWith('#')) {
    hashPart = trimmed.slice(1);
  }

  if (hashPart.includes(':')) {
    const [prefixId, keyPart] = hashPart.split(':', 2);
    if (prefixId && keyPart) {
      return {
        shareId: prefixId,
        shareKeyBase64: keyPart,
      };
    }
  }

  if (!hashPart) {
    throw new Error('ERR_SHARE_EMPTY_FRAGMENT');
  }

  return {
    shareKeyBase64: hashPart,
    shareId: queryShareId,
  };
}

/**
 * Encrypts an `EphemeralSharePayload` into a single Base64 blob `(24B nonce || 256B-padded XChaCha20-Poly1305 ciphertext)`
 * under the 32-byte `shareKey`.
 */
export async function encryptSharePayload(
  itemPayload: EphemeralSharePayload,
  shareKey: Uint8Array,
  shareId: string
): Promise<string> {
  await sodium.ready;
  if (!(shareKey instanceof Uint8Array) || shareKey.byteLength !== DEK_BYTES) {
    throw new Error('ERR_SHARE_INVALID_KEY_LENGTH');
  }
  if (typeof itemPayload !== 'object' || itemPayload === null) {
    throw new Error('ERR_SHARE_INVALID_PAYLOAD');
  }
  const workingKey = new Uint8Array(shareKey);
  const plaintextBytes = sodium.from_string(JSON.stringify(itemPayload));
  const padded = padTo256(plaintextBytes);
  const nonce = sodium.randombytes_buf(AEAD_NONCE_BYTES);
  const aadBytes = sodium.from_string(buildShareAad(shareId));
  try {
    const ciphertext = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
      padded,
      aadBytes,
      null,
      nonce,
      workingKey
    );
    const combined = new Uint8Array(nonce.byteLength + ciphertext.byteLength);
    combined.set(nonce, 0);
    combined.set(ciphertext, nonce.byteLength);
    return sodium.to_base64(combined, sodium.base64_variants.ORIGINAL);
  } finally {
    sodium.memzero(workingKey);
    sodium.memzero(plaintextBytes);
    sodium.memzero(padded);
  }
}

/**
 * Decrypts and unpads a Base64 `(24B nonce || ciphertext)` ephemeral share blob in RAM.
 */
export async function decryptSharePayload(
  encryptedPayloadBase64: string,
  shareKey: Uint8Array,
  shareId: string
): Promise<EphemeralSharePayload> {
  await sodium.ready;
  if (!(shareKey instanceof Uint8Array) || shareKey.byteLength !== DEK_BYTES) {
    throw new Error('ERR_SHARE_INVALID_KEY_LENGTH');
  }
  if (typeof encryptedPayloadBase64 !== 'string' || encryptedPayloadBase64.trim().length === 0) {
    throw new Error('ERR_SHARE_EMPTY_CIPHERTEXT');
  }
  const combined = sodium.from_base64(
    encryptedPayloadBase64.trim(),
    sodium.base64_variants.ORIGINAL
  );
  if (combined.byteLength < AEAD_NONCE_BYTES + 256 + AEAD_TAG_BYTES) {
    throw new Error('ERR_SHARE_CORRUPTED_CIPHERTEXT');
  }
  const nonce = combined.slice(0, AEAD_NONCE_BYTES);
  const ciphertext = combined.slice(AEAD_NONCE_BYTES);
  const aadBytes = sodium.from_string(buildShareAad(shareId));
  const workingKey = new Uint8Array(shareKey);
  let padded: Uint8Array | null = null;
  let unpadded: Uint8Array | null = null;
  try {
    padded = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
      null,
      ciphertext,
      aadBytes,
      nonce,
      workingKey
    );
    unpadded = unpadFrom256(padded);
    const jsonStr = sodium.to_string(unpadded);
    return JSON.parse(jsonStr);
  } catch {
    throw new Error('ERR_SHARE_DECRYPTION_FAILED');
  } finally {
    sodium.memzero(workingKey);
    if (padded) {
      sodium.memzero(padded);
    }
    if (unpadded) {
      sodium.memzero(unpadded);
    }
  }
}

/**
 * Generates a fresh 256-bit `shareKey`, derives `burnToken` from `shareKey`,
 * encrypts `itemPayload` with XChaCha20-Poly1305-IETF, uploads `{ shareId, encryptedPayload, burnToken }`
 * to `POST /v1/share/create` (`maxViews = 1`, `expiresAt = now + 5m`), and formats the URL as:
 * `https://share.vaultguard.dev/#<shareId>:<shareKeyBase64>`.
 */
export async function createEphemeralShare(
  itemPayload: EphemeralSharePayload,
  options: EphemeralShareOptions = {}
): Promise<CreatedEphemeralShare> {
  await sodium.ready;
  if (typeof itemPayload !== 'object' || itemPayload === null) {
    throw new Error('ERR_SHARE_INVALID_PAYLOAD');
  }
  const shareKey = sodium.randombytes_buf(DEK_BYTES);
  try {
    const shareId = options.shareId ?? crypto.randomUUID();
    const rawTtl = options.ttlMs ?? DEFAULT_SHARE_TTL_MS;
    const ttlMs = Math.min(Math.max(rawTtl, 1_000), MAX_SHARE_TTL_MS);
    const nowMs = Date.now();
    const defaultExpiresAt = nowMs + ttlMs;
    const shareKeyBase64 = sodium.to_base64(shareKey, sodium.base64_variants.URLSAFE_NO_PADDING);
    const burnToken = await deriveShareBurnToken(shareKey);
    const encryptedPayload = await encryptSharePayload(itemPayload, shareKey, shareId);
    let finalShareId = shareId;
    let finalExpiresAt = defaultExpiresAt;

    if (options.transport) {
      const relayBase = (options.relayServerUrl ?? DEFAULT_SHARE_RELAY_URL).replace(/\/+$/, '');
      const res = await options.transport({
        method: 'POST',
        url: `${relayBase}/v1/share/create`,
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          shareId,
          encryptedPayload,
          burnToken,
          ttlMs,
          maxViews: 1,
        }),
      });
      if (!res.ok) {
        throw new Error(`ERR_SHARE_CREATE_FAILED_${String(res.status)}`);
      }
      const parsed = JSON.parse(res.bodyText);
      if (typeof parsed.shareId === 'string' && parsed.shareId.length > 0) {
        finalShareId = parsed.shareId;
      }
      if (typeof parsed.expiresAt === 'number') {
        finalExpiresAt = parsed.expiresAt;
      }
    } else {
      inMemoryShareRelayStore.set(finalShareId, {
        encryptedPayload,
        burnToken,
        expiresAt: finalExpiresAt,
        viewCount: 0,
        maxViews: 1,
      });
    }

    const baseUrl = (options.shareBaseUrl ?? DEFAULT_SHARE_BASE_URL).replace(/\/+$/, '');
    const url = `${baseUrl}/#${finalShareId}:${shareKeyBase64}`;
    return {
      shareId: finalShareId,
      shareKeyBase64,
      burnToken,
      url,
      encryptedPayload,
      expiresAt: finalExpiresAt,
    };
  } finally {
    sodium.memzero(shareKey);
  }
}

export interface BurnEphemeralShareOptions {
  burnToken?: string;
  shareKeyBase64?: string;
  relayServerUrl?: string;
  transport?: (req: {
    method: string;
    url: string;
    headers?: Record<string, string>;
    body?: string;
  }) => Promise<{ ok: boolean; status: number; bodyText: string }>;
}

/**
 * Explicitly burns an ephemeral share on the relay server via `POST /v1/share/:id/burn`
 * authenticated with `burnToken` (derived from `shareKey`).
 */
export async function burnEphemeralShare(
  shareId: string,
  options: BurnEphemeralShareOptions = {}
): Promise<boolean> {
  await sodium.ready;
  const trimmedId = shareId.trim();
  if (!trimmedId) {
    throw new Error('ERR_SHARE_INVALID_ID');
  }
  let resolvedBurnToken = options.burnToken?.trim() ?? '';
  if (!resolvedBurnToken && options.shareKeyBase64) {
    const shareKey = sodium.from_base64(
      options.shareKeyBase64.trim(),
      sodium.base64_variants.URLSAFE_NO_PADDING
    );
    try {
      resolvedBurnToken = await deriveShareBurnToken(shareKey);
    } finally {
      sodium.memzero(shareKey);
    }
  }
  if (!resolvedBurnToken) {
    throw new Error('ERR_SHARE_MISSING_BURN_TOKEN');
  }

  const entry = inMemoryShareRelayStore.get(trimmedId);
  if (entry) {
    if (entry.burnToken !== resolvedBurnToken) {
      throw new Error('ERR_SHARE_INVALID_BURN_TOKEN');
    }
    entry.viewCount += 1;
    inMemoryShareRelayStore.delete(trimmedId);
  }

  if (options.transport) {
    const relayBase = (options.relayServerUrl ?? DEFAULT_SHARE_RELAY_URL).replace(/\/+$/, '');
    const res = await options.transport({
      method: 'POST',
      url: `${relayBase}/v1/share/${encodeURIComponent(trimmedId)}/burn`,
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        burnToken: resolvedBurnToken,
      }),
    });
    return res.ok;
  }
  return true;
}

export interface ConsumeEphemeralShareOptions {
  burnAfterReading?: boolean;
  encryptedPayloadOverride?: string;
  relayServerUrl?: string;
  transport?: (req: {
    method: string;
    url: string;
    headers?: Record<string, string>;
    body?: string;
  }) => Promise<{ ok: boolean; status: number; bodyText: string }>;
}

/**
 * One-Time Ephemeral Share Consumer:
 * 1. Fetches the ciphertext via `GET /v1/share/:id` (burned after first view or 5 minutes).
 * 2. Decrypts the payload in RAM using `shareKeyBase64` from the URL fragment.
 * 3. Derives `burnToken` from `shareKey` and calls `POST /v1/share/:id/burn` to guarantee server-side deletion.
 * 4. Zeroizes `shareKey` via `sodium.memzero()` in `finally`.
 */
export async function consumeEphemeralShare(
  shareId: string,
  shareKeyBase64: string,
  options: ConsumeEphemeralShareOptions = {}
): Promise<EphemeralSharePayload> {
  await sodium.ready;
  const trimmedId = shareId.trim();
  if (!trimmedId) {
    throw new Error('ERR_SHARE_INVALID_ID');
  }
  if (typeof shareKeyBase64 !== 'string' || shareKeyBase64.trim().length === 0) {
    throw new Error('ERR_SHARE_INVALID_KEY');
  }
  const shareKey = sodium.from_base64(
    shareKeyBase64.trim(),
    sodium.base64_variants.URLSAFE_NO_PADDING
  );
  try {
    let encryptedPayload = options.encryptedPayloadOverride;
    if (!encryptedPayload) {
      if (options.transport) {
        const relayBase = (options.relayServerUrl ?? DEFAULT_SHARE_RELAY_URL).replace(/\/+$/, '');
        const res = await options.transport({
          method: 'GET',
          url: `${relayBase}/v1/share/${encodeURIComponent(trimmedId)}`,
          headers: {},
        });
        if (!res.ok) {
          throw new Error('ERR_SHARE_EXPIRED_OR_CONSUMED');
        }
        const parsed = JSON.parse(res.bodyText);
        encryptedPayload = parsed.encryptedPayload;
      } else {
        const entry = inMemoryShareRelayStore.get(trimmedId);
        const nowMs = Date.now();
        if (!entry || nowMs >= entry.expiresAt || entry.viewCount >= entry.maxViews) {
          inMemoryShareRelayStore.delete(trimmedId);
          throw new Error('ERR_SHARE_EXPIRED_OR_CONSUMED');
        }
        encryptedPayload = entry.encryptedPayload;
      }
    }
    const decrypted = await decryptSharePayload(encryptedPayload!, shareKey, trimmedId);
    if (options.burnAfterReading !== false) {
      const burnToken = await deriveShareBurnToken(shareKey);
      await burnEphemeralShare(trimmedId, {
        burnToken,
        relayServerUrl: options.relayServerUrl,
        transport: options.transport,
      });
    }
    return decrypted;
  } finally {
    sodium.memzero(shareKey);
  }
}
