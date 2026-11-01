/**
 * @vaultguard/crypto — Formal VaultManifest Keyed BLAKE2b Signature Scheme (`manifest.ts`)
 * Locked to ENVELOPE_SPEC.md v2 §4.3 & ADR-004 (`"VG_MAN_S"` 8-byte context, ID=3)
 */

import sodium from 'libsodium-wrappers-sumo';
import {
  DEK_BYTES,
  MAN_ID,
  BLAKE2B_CTX_MANIFEST_SIG,
  MANIFEST_MAC_BYTES,
  VaultManifest,
  VaultGuardError,
  ERR_MANIFEST_MAC_FAILED,
  ERR_VAULT_ROLLBACK,
} from '@vaultguard/shared';

/**
 * Deterministic canonical JSON serializer: recursively sorts object keys
 * lexicographically and outputs compact JSON with zero whitespace.
 */
export function canonicalJSON(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    const serializedItems = value.map(item => canonicalJSON(item));
    return `[${serializedItems.join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  const sortedKeys = Object.keys(record)
    .filter(k => record[k] !== undefined && k !== 'manifestMac')
    .sort();
  const pairs = sortedKeys.map(key => `${JSON.stringify(key)}:${canonicalJSON(record[key])}`);
  return `{${pairs.join(',')}}`;
}

/**
 * Derives the 32-byte ManifestKey via `crypto_kdf_derive_from_key(32, 3, "VG_MAN_S", dek)`
 * and computes a 32-byte keyed BLAKE2b MAC (`crypto_generichash`) over `canonicalJSON(manifest)`.
 * Starts with `await sodium.ready` and wipes `manifestKey` in `finally`.
 */
export async function signManifest(
  dek: Uint8Array,
  manifest: VaultManifest
): Promise<VaultManifest> {
  await sodium.ready; // MUST be first line

  if (!(dek instanceof Uint8Array) || dek.byteLength !== DEK_BYTES) {
    throw new Error('MANIFEST_INVALID_DEK_LENGTH');
  }
  if (typeof manifest !== 'object' || manifest === null) {
    throw new Error('MANIFEST_INVALID_PAYLOAD');
  }

  let manifestKey: Uint8Array | null = null;
  try {
    manifestKey = sodium.crypto_kdf_derive_from_key(
      DEK_BYTES,
      MAN_ID,
      BLAKE2B_CTX_MANIFEST_SIG,
      dek
    );
    const serializedBytes = sodium.from_string(canonicalJSON(manifest));
    const mac = sodium.crypto_generichash(MANIFEST_MAC_BYTES, serializedBytes, manifestKey);
    const macBase64 = sodium.to_base64(mac, sodium.base64_variants.ORIGINAL);
    return {
      ...manifest,
      manifestMac: macBase64,
    };
  } finally {
    if (manifestKey) {
      sodium.memzero(manifestKey);
    }
  }
}

/**
 * Verifies a VaultManifest's 32-byte keyed BLAKE2b MAC in constant time (`sodium.memcmp`),
 * and optionally enforces rollback protection (`manifest.vaultSeq >= minExpectedSeq`).
 * Starts with `await sodium.ready` and wipes `manifestKey` + `expectedMac` in `finally`.
 */
export async function verifyManifest(
  dek: Uint8Array,
  manifest: VaultManifest,
  macOrSeq?: Uint8Array | string | number,
  minExpectedSeq?: number
): Promise<boolean> {
  await sodium.ready; // MUST be first line

  if (!(dek instanceof Uint8Array) || dek.byteLength !== DEK_BYTES) {
    throw new Error('MANIFEST_INVALID_DEK_LENGTH');
  }
  if (typeof manifest !== 'object' || manifest === null) {
    throw new VaultGuardError(ERR_MANIFEST_MAC_FAILED);
  }

  let rawMac: Uint8Array;
  let minSeq = 0;

  if (typeof macOrSeq === 'number') {
    minSeq = macOrSeq;
    if (!manifest.manifestMac) {
      throw new VaultGuardError(ERR_MANIFEST_MAC_FAILED);
    }
    rawMac = typeof manifest.manifestMac === 'string'
      ? sodium.from_base64(manifest.manifestMac, sodium.base64_variants.ORIGINAL)
      : manifest.manifestMac;
  } else if (macOrSeq !== undefined) {
    rawMac = typeof macOrSeq === 'string'
      ? sodium.from_base64(macOrSeq, sodium.base64_variants.ORIGINAL)
      : macOrSeq;
    minSeq = minExpectedSeq ?? 0;
  } else {
    if (!manifest.manifestMac) {
      throw new VaultGuardError(ERR_MANIFEST_MAC_FAILED);
    }
    rawMac = typeof manifest.manifestMac === 'string'
      ? sodium.from_base64(manifest.manifestMac, sodium.base64_variants.ORIGINAL)
      : manifest.manifestMac;
  }

  if (rawMac.byteLength !== MANIFEST_MAC_BYTES) {
    throw new VaultGuardError(ERR_MANIFEST_MAC_FAILED);
  }

  if (minSeq > 0 && manifest.vaultSeq < minSeq) {
    throw new VaultGuardError(ERR_VAULT_ROLLBACK);
  }

  let manifestKey: Uint8Array | null = null;
  let expectedMac: Uint8Array | null = null;
  try {
    manifestKey = sodium.crypto_kdf_derive_from_key(
      DEK_BYTES,
      MAN_ID,
      BLAKE2B_CTX_MANIFEST_SIG,
      dek
    );
    const serializedBytes = sodium.from_string(canonicalJSON(manifest));
    expectedMac = sodium.crypto_generichash(MANIFEST_MAC_BYTES, serializedBytes, manifestKey);
    const valid = sodium.memcmp(expectedMac, rawMac);
    if (!valid) {
      throw new VaultGuardError(ERR_MANIFEST_MAC_FAILED);
    }
    return true;
  } finally {
    if (manifestKey) {
      sodium.memzero(manifestKey);
    }
    if (expectedMac) {
      sodium.memzero(expectedMac);
    }
  }
}
