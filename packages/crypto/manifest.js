/**
 * @vaultguard/crypto — Formal VaultManifest Keyed BLAKE2b Signature Scheme (`manifest.ts`)
 * Locked to ENVELOPE_SPEC.md v2 §4.3 & ADR-004 (`"VG_MAN_S"` 8-byte context, ID=3)
 */

import sodium from 'libsodium-wrappers-sumo';
import { DEK_BYTES, MAN_ID, BLAKE2B_CTX_MANIFEST_SIG, MANIFEST_MAC_BYTES } from '@vaultguard/shared';
/**
 * Deterministic canonical JSON serializer: recursively sorts object keys
 * lexicographically and outputs compact JSON with zero whitespace.
 */
export function canonicalJSON(value) {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    const serializedItems = value.map(item => canonicalJSON(item));
    return `[${serializedItems.join(',')}]`;
  }
  const record = value;
  const sortedKeys = Object.keys(record).filter(k => record[k] !== undefined && k !== 'manifestMac').sort();
  const pairs = sortedKeys.map(key => `${JSON.stringify(key)}:${canonicalJSON(record[key])}`);
  return `{${pairs.join(',')}}`;
}

/**
 * Derives the 32-byte ManifestKey via `crypto_kdf_derive_from_key(32, 3, "VG_MAN_S", dek)`
 * and computes a 32-byte keyed BLAKE2b MAC (`crypto_generichash`) over `canonicalJSON(manifest)`.
 * Starts with `await sodium.ready` and wipes `manifestKey` in `finally`.
 */
export async function signManifest(dek, manifest) {
  await sodium.ready; // MUST be first line

  if (!(dek instanceof Uint8Array) || dek.byteLength !== DEK_BYTES) {
    throw new Error('MANIFEST_INVALID_DEK_LENGTH');
  }
  if (typeof manifest !== 'object' || manifest === null || typeof manifest.vaultId !== 'string' || !Number.isInteger(manifest.globalRevision) || manifest.globalRevision < 1 || !Number.isInteger(manifest.itemCount) || manifest.itemCount < 0) {
    throw new Error('MANIFEST_INVALID_PAYLOAD');
  }
  let manifestKey = null;
  try {
    manifestKey = sodium.crypto_kdf_derive_from_key(DEK_BYTES, MAN_ID, BLAKE2B_CTX_MANIFEST_SIG, dek);
    const serializedBytes = sodium.from_string(canonicalJSON(manifest));
    const mac = sodium.crypto_generichash(MANIFEST_MAC_BYTES, serializedBytes, manifestKey);
    return {
      mac
    };
  } finally {
    if (manifestKey) {
      sodium.memzero(manifestKey);
    }
  }
}

/**
 * Verifies a VaultManifest's 32-byte keyed BLAKE2b MAC in constant time (`sodium.memcmp`),
 * and optionally enforces rollback protection (`manifest.globalRevision >= minExpectedRevision`).
 * Starts with `await sodium.ready` and wipes `manifestKey` + `expectedMac` in `finally`.
 */
export async function verifyManifest(dek, manifest, mac, minExpectedRevision = 1) {
  await sodium.ready; // MUST be first line

  if (!(dek instanceof Uint8Array) || dek.byteLength !== DEK_BYTES) {
    throw new Error('MANIFEST_INVALID_DEK_LENGTH');
  }
  if (!(mac instanceof Uint8Array) || mac.byteLength !== MANIFEST_MAC_BYTES) {
    return false;
  }
  if (typeof manifest !== 'object' || manifest === null || !Number.isInteger(manifest.globalRevision) || manifest.globalRevision < minExpectedRevision) {
    return false;
  }
  let manifestKey = null;
  let expectedMac = null;
  try {
    manifestKey = sodium.crypto_kdf_derive_from_key(DEK_BYTES, MAN_ID, BLAKE2B_CTX_MANIFEST_SIG, dek);
    const serializedBytes = sodium.from_string(canonicalJSON(manifest));
    expectedMac = sodium.crypto_generichash(MANIFEST_MAC_BYTES, serializedBytes, manifestKey);
    return sodium.memcmp(expectedMac, mac);
  } finally {
    if (manifestKey) {
      sodium.memzero(manifestKey);
    }
    if (expectedMac) {
      sodium.memzero(expectedMac);
    }
  }
}