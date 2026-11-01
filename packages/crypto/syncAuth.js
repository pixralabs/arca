/**
 * @vaultguard/crypto — Zero-Knowledge Sync Ed25519 Challenge-Response & Registration Auth (`syncAuth.ts`)
 * Locked to SYNC_PROTOCOL.md v1.0, ARCHITECTURE.md v4.4 & Patch VG-03 (v0.4.1):
 * - Every async function starts with `await sodium.ready;` on its very first line.
 * - Derives a 32-byte `authSeed` from the 32-byte `DEK` using Libsodium BLAKE2b
 *   (`"VG_AUT_1"`, `AUT_ID = 5`) and derives a deterministic Ed25519 keypair
 *   via `sodium.crypto_sign_seed_keypair(authSeed)`.
 * - Patch VG-03: Signs the canonical account registration preimage:
 *   `"VG_SYNC_REGISTER_V1:" + accountId + ":" + accountAuthPubKey`
 *   to prove possession of the Ed25519 private key during `POST /v1/auth/register`.
 * - Signs the canonical challenge-response preimage:
 *   `"VG_SYNC_AUTH_V1:" + challengeNonce + accountId + deviceId + timestamp + bodySha256`
 * - Wipes `workingDek`, `authSeed`, and `privateKey` via `sodium.memzero()` in `finally`.
 */

import sodium from 'libsodium-wrappers-sumo';
import { DEK_BYTES, AUT_ID, BLAKE2B_CTX_SYNC_AUTH } from '@vaultguard/shared';
export const SYNC_AUTH_DOMAIN_PREFIX = 'VG_SYNC_AUTH_V1:';
export const SYNC_REGISTER_DOMAIN_PREFIX = 'VG_SYNC_REGISTER_V1:';
export const ED25519_PUBLIC_KEY_BYTES = 32;
export const ED25519_SECRET_KEY_BYTES = 64;
export const ED25519_SIGNATURE_BYTES = 64;
export const EMPTY_BODY_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const HEX_64_REGEX = /^[0-9a-f]{64}$/i;

/**
 * Patch VG-03: Constructs the canonical UTF-8 registration proof-of-possession preimage:
 * `"VG_SYNC_REGISTER_V1:" + accountId + ":" + accountAuthPubKey`
 */
export function buildSyncRegisterPreimage(accountId, accountAuthPubKey) {
  if (typeof accountId !== 'string' || accountId.trim().length === 0) {
    throw new Error('SYNC_AUTH_INVALID_ACCOUNT_ID');
  }
  if (typeof accountAuthPubKey !== 'string' || accountAuthPubKey.trim().length === 0) {
    throw new Error('SYNC_AUTH_INVALID_PUBLIC_KEY');
  }
  return `${SYNC_REGISTER_DOMAIN_PREFIX}${accountId.trim()}:${accountAuthPubKey.trim()}`;
}

/**
 * Constructs the canonical UTF-8 challenge-response preimage string:
 * `"VG_SYNC_AUTH_V1:" + challengeNonce + accountId + deviceId + timestamp + bodySha256`
 */
export function buildSyncAuthPreimage(input) {
  if (typeof input.challengeNonce !== 'string' || !HEX_64_REGEX.test(input.challengeNonce)) {
    throw new Error('SYNC_AUTH_INVALID_CHALLENGE_NONCE');
  }
  if (typeof input.accountId !== 'string' || input.accountId.trim().length === 0) {
    throw new Error('SYNC_AUTH_INVALID_ACCOUNT_ID');
  }
  if (typeof input.deviceId !== 'string' || input.deviceId.trim().length === 0) {
    throw new Error('SYNC_AUTH_INVALID_DEVICE_ID');
  }
  if (!Number.isSafeInteger(input.timestamp) || input.timestamp <= 0) {
    throw new Error('SYNC_AUTH_INVALID_TIMESTAMP');
  }
  if (typeof input.bodySha256 !== 'string' || !HEX_64_REGEX.test(input.bodySha256)) {
    throw new Error('SYNC_AUTH_INVALID_BODY_SHA256');
  }
  return `${SYNC_AUTH_DOMAIN_PREFIX}${input.challengeNonce}${input.accountId}${input.deviceId}${String(input.timestamp)}${input.bodySha256.toLowerCase()}`;
}

/**
 * Computes the lowercase 64-character hex SHA-256 digest of a request body (`string` or `Uint8Array`)
 * using native WebCrypto `SubtleCrypto.digest('SHA-256', ...)`.
 * Starts with `await sodium.ready;` on line 1.
 */
export async function computeBodySha256Hex(body = '') {
  await sodium.ready;
  const bytes = typeof body === 'string' ? new TextEncoder().encode(body) : new Uint8Array(body);
  if (bytes.byteLength === 0) {
    return EMPTY_BODY_SHA256;
  }
  const digestBuffer = await crypto.subtle.digest('SHA-256', bytes);
  const digestBytes = new Uint8Array(digestBuffer);
  let hexOut = '';
  for (let i = 0; i < digestBytes.byteLength; i++) {
    const b = digestBytes[i] ?? 0;
    hexOut += b.toString(16).padStart(2, '0');
  }
  return hexOut;
}

/**
 * Derives a deterministic Ed25519 keypair from the 32-byte Vault `DEK` using
 * Libsodium BLAKE2b subkey derivation (`"VG_AUT_1"`, `AUT_ID = 5`).
 * Starts with `await sodium.ready;` on line 1 and wipes `workingDek` + `authSeed` in `finally`.
 */
export async function deriveSyncAuthKeyPair(dek) {
  await sodium.ready;
  if (!(dek instanceof Uint8Array) || dek.byteLength !== DEK_BYTES) {
    throw new Error('SYNC_AUTH_INVALID_DEK_LENGTH');
  }
  const workingDek = new Uint8Array(dek);
  let authSeed = null;
  try {
    authSeed = sodium.crypto_kdf_derive_from_key(DEK_BYTES, AUT_ID, BLAKE2B_CTX_SYNC_AUTH, workingDek);
    const keyPair = sodium.crypto_sign_seed_keypair(authSeed);
    const publicKeyBase64 = sodium.to_base64(keyPair.publicKey, sodium.base64_variants.ORIGINAL);
    return {
      publicKey: keyPair.publicKey,
      privateKey: keyPair.privateKey,
      publicKeyBase64
    };
  } finally {
    sodium.memzero(workingDek);
    if (authSeed) {
      sodium.memzero(authSeed);
    }
  }
}

/**
 * Patch VG-03: Signs an account registration request (`accountId` + `accountAuthPubKey`)
 * using the `VG_AUT_1` Ed25519 private key derived from `dek`.
 * Starts with `await sodium.ready;` on line 1 and zeroizes `privateKey` in `finally`.
 */
export async function signSyncRegistration(dek, accountId) {
  await sodium.ready;
  const keyPair = await deriveSyncAuthKeyPair(dek);
  try {
    const preimage = buildSyncRegisterPreimage(accountId, keyPair.publicKeyBase64);
    const preimageBytes = sodium.from_string(preimage);
    const signature = sodium.crypto_sign_detached(preimageBytes, keyPair.privateKey);
    const registrationSignature = sodium.to_base64(signature, sodium.base64_variants.ORIGINAL);
    return {
      accountId: accountId.trim(),
      accountAuthPubKey: keyPair.publicKeyBase64,
      preimage,
      signature,
      registrationSignature
    };
  } finally {
    sodium.memzero(keyPair.privateKey);
  }
}

/**
 * Patch VG-03: Verifies a detached 64-byte Ed25519 `registrationSignature` over
 * `"VG_SYNC_REGISTER_V1:" + accountId + ":" + accountAuthPubKey`.
 * Starts with `await sodium.ready;` on line 1.
 */
export async function verifySyncRegistrationSignature(publicKey, accountId, accountAuthPubKey, signature) {
  await sodium.ready;
  if (!(publicKey instanceof Uint8Array) || publicKey.byteLength !== ED25519_PUBLIC_KEY_BYTES) {
    return false;
  }
  if (!(signature instanceof Uint8Array) || signature.byteLength !== ED25519_SIGNATURE_BYTES) {
    return false;
  }
  try {
    const preimage = buildSyncRegisterPreimage(accountId, accountAuthPubKey);
    const preimageBytes = sodium.from_string(preimage);
    return sodium.crypto_sign_verify_detached(signature, preimageBytes, publicKey);
  } catch {
    return false;
  }
}

/**
 * Signs a sync challenge-response request using the `VG_AUT_1` Ed25519 subkey derived from `dek`.
 * Starts with `await sodium.ready;` on line 1 and zeroizes the Ed25519 `privateKey` in `finally`.
 */
export async function signSyncChallenge(dek, input) {
  await sodium.ready;
  const keyPair = await deriveSyncAuthKeyPair(dek);
  try {
    const bodySha256 = await computeBodySha256Hex(input.body ?? '');
    const preimage = buildSyncAuthPreimage({
      challengeNonce: input.challengeNonce,
      accountId: input.accountId,
      deviceId: input.deviceId,
      timestamp: input.timestamp,
      bodySha256
    });
    const preimageBytes = sodium.from_string(preimage);
    const signature = sodium.crypto_sign_detached(preimageBytes, keyPair.privateKey);
    const signatureBase64 = sodium.to_base64(signature, sodium.base64_variants.ORIGINAL);
    return {
      accountId: input.accountId,
      deviceId: input.deviceId,
      challengeNonce: input.challengeNonce,
      timestamp: input.timestamp,
      bodySha256,
      preimage,
      signature,
      signatureBase64,
      publicKeyBase64: keyPair.publicKeyBase64,
      headers: {
        'x-vg-account-id': input.accountId,
        'x-vg-device-id': input.deviceId,
        'x-vg-challenge-nonce': input.challengeNonce,
        'x-vg-timestamp': String(input.timestamp),
        'x-vg-body-sha256': bodySha256,
        'x-vg-signature': signatureBase64
      }
    };
  } finally {
    sodium.memzero(keyPair.privateKey);
  }
}

/**
 * Verifies a detached 64-byte Ed25519 signature over the `VG_SYNC_AUTH_V1:` preimage string.
 * Starts with `await sodium.ready;` on line 1.
 */
export async function verifySyncChallengeSignature(publicKey, preimage, signature) {
  await sodium.ready;
  if (!(publicKey instanceof Uint8Array) || publicKey.byteLength !== ED25519_PUBLIC_KEY_BYTES) {
    return false;
  }
  if (!(signature instanceof Uint8Array) || signature.byteLength !== ED25519_SIGNATURE_BYTES) {
    return false;
  }
  if (typeof preimage !== 'string' || !preimage.startsWith(SYNC_AUTH_DOMAIN_PREFIX)) {
    return false;
  }
  try {
    const preimageBytes = sodium.from_string(preimage);
    return sodium.crypto_sign_verify_detached(signature, preimageBytes, publicKey);
  } catch {
    return false;
  }
}