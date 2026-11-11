/**
 * @vaultguard/crypto — Zero-Knowledge Sync Ed25519 Challenge-Response, Registration,
 * New Device Authorization & 24-Word Recovery Authority Proof (`syncAuth.ts`)
 *
 * Security Guarantees:
 * - Every async function starts with `await sodium.ready;` on its very first line.
 * - Derives a 32-byte `authSeed` from the 32-byte `DEK` using Libsodium BLAKE2b
 *   (`"VG_AUT_1"`, `AUT_ID = 5`) and derives a deterministic Ed25519 keypair.
 * - Derives a mathematically independent 32-byte `recoveryAuthSeed` directly from the
 *   256-bit BIP39 Recovery Entropy (`"VG_RAU_1"`, `RAU_ID = 6`) so that 24-Word Recovery Kit
 *   device-approval bypasses (`VG_DEVICE_RECOVERY_V1:`) CANNOT be forged by anyone who only
 *   possesses the Master Password or `DEK`.
 * - Derives per-device Ed25519 identity keys (`"VG_DEV_1"`, `DEV_ID = 7`) bound to `deviceId`.
 * - Wipes all transient private keys and seeds via `sodium.memzero()` in `finally`.
 */

import sodium from 'libsodium-wrappers-sumo';
import { mnemonicToEntropy, validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';
import {
  DEK_BYTES,
  RECOVERY_ENTROPY_BYTES,
  AUT_ID,
  RAU_ID,
  DEV_ID,
  BLAKE2B_CTX_SYNC_AUTH,
  BLAKE2B_CTX_RECOVERY_AUTH,
  BLAKE2B_CTX_DEVICE_AUTH,
} from '@vaultguard/shared';

export const SYNC_AUTH_DOMAIN_PREFIX = 'VG_SYNC_AUTH_V1:';
export const SYNC_REGISTER_DOMAIN_PREFIX = 'VG_SYNC_REGISTER_V1:';
export const DEVICE_REQUEST_DOMAIN_PREFIX = 'VG_DEVICE_REQ_V1:';
export const DEVICE_APPROVE_DOMAIN_PREFIX = 'VG_DEVICE_APPROVE_V1:';
export const DEVICE_RECOVERY_DOMAIN_PREFIX = 'VG_DEVICE_RECOVERY_V1:';
export const ED25519_PUBLIC_KEY_BYTES = 32;
export const ED25519_SECRET_KEY_BYTES = 64;
export const ED25519_SIGNATURE_BYTES = 64;
export const EMPTY_BODY_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

const HEX_64_REGEX = /^[0-9a-f]{64}$/i;

/**
 * Constructs the canonical UTF-8 registration proof-of-possession preimage:
 * `"VG_SYNC_REGISTER_V1:" + accountId + ":" + accountAuthPubKey`
 */
export function buildSyncRegisterPreimage(accountId: string, accountAuthPubKey: string): string {
  if (typeof accountId !== 'string' || accountId.trim().length === 0) {
    throw new Error('SYNC_AUTH_INVALID_ACCOUNT_ID');
  }
  if (typeof accountAuthPubKey !== 'string' || accountAuthPubKey.trim().length === 0) {
    throw new Error('SYNC_AUTH_INVALID_PUBLIC_KEY');
  }
  return `${SYNC_REGISTER_DOMAIN_PREFIX}${accountId.trim()}:${accountAuthPubKey.trim()}`;
}

export interface SyncAuthPreimageInput {
  challengeNonce: string;
  accountId: string;
  deviceId: string;
  timestamp: number;
  bodySha256: string;
}

/**
 * Constructs the canonical UTF-8 challenge-response preimage string:
 * `"VG_SYNC_AUTH_V1:" + challengeNonce + accountId + deviceId + timestamp + bodySha256`
 */
export function buildSyncAuthPreimage(input: SyncAuthPreimageInput): string {
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
  return `${SYNC_AUTH_DOMAIN_PREFIX}${input.challengeNonce}${input.accountId}${input.deviceId}${String(
    input.timestamp
  )}${input.bodySha256.toLowerCase()}`;
}

/**
 * Constructs the canonical UTF-8 preimage for `POST /v1/device/request`:
 * `"VG_DEVICE_REQ_V1:" + challengeNonce + ":" + accountId + ":" + deviceId + ":" + deviceAuthPubKey + ":" + timestamp`
 */
export function buildDeviceRequestPreimage(
  challengeNonce: string,
  accountId: string,
  deviceId: string,
  deviceAuthPubKey: string,
  timestamp: number
): string {
  if (typeof challengeNonce !== 'string' || !HEX_64_REGEX.test(challengeNonce)) {
    throw new Error('SYNC_AUTH_INVALID_CHALLENGE_NONCE');
  }
  return `${DEVICE_REQUEST_DOMAIN_PREFIX}${challengeNonce.trim()}:${accountId.trim()}:${deviceId.trim()}:${deviceAuthPubKey.trim()}:${String(
    timestamp
  )}`;
}

/**
 * Constructs the canonical UTF-8 preimage for 24-Word Recovery Kit bypass (`POST /v1/device/request`):
 * `"VG_DEVICE_RECOVERY_V1:" + challengeNonce + ":" + accountId + ":" + deviceId + ":" + deviceAuthPubKey + ":" + timestamp`
 */
export function buildDeviceRecoveryPreimage(
  challengeNonce: string,
  accountId: string,
  deviceId: string,
  deviceAuthPubKey: string,
  timestamp: number
): string {
  if (typeof challengeNonce !== 'string' || !HEX_64_REGEX.test(challengeNonce)) {
    throw new Error('SYNC_AUTH_INVALID_CHALLENGE_NONCE');
  }
  return `${DEVICE_RECOVERY_DOMAIN_PREFIX}${challengeNonce.trim()}:${accountId.trim()}:${deviceId.trim()}:${deviceAuthPubKey.trim()}:${String(
    timestamp
  )}`;
}

/**
 * Constructs the canonical UTF-8 preimage for `POST /v1/device/approve`:
 * `"VG_DEVICE_APPROVE_V1:" + accountId + ":" + approverDeviceId + ":" + targetDeviceId + ":" + targetDevicePubKey + ":" + ("ALLOW"|"DENY")`
 */
export function buildDeviceApprovalPreimage(
  accountId: string,
  approverDeviceId: string,
  targetDeviceId: string,
  targetDevicePubKey: string,
  approve: boolean
): string {
  const decision = approve ? 'ALLOW' : 'DENY';
  return `${DEVICE_APPROVE_DOMAIN_PREFIX}${accountId.trim()}:${approverDeviceId.trim()}:${targetDeviceId.trim()}:${targetDevicePubKey.trim()}:${decision}`;
}

/**
 * Computes a 6-character human-verifiable Short Authentication String (SAS) code
 * (`XXX-XXX`) from `(accountId, deviceId, deviceAuthPubKey)` using SHA-256.
 */
export async function computeDeviceShortCode(
  accountId: string,
  deviceId: string,
  deviceAuthPubKey: string
): Promise<string> {
  await sodium.ready;
  const input = `VG_DEVICE_SAS_V1:${accountId.trim()}:${deviceId.trim()}:${deviceAuthPubKey.trim()}`;
  const bytes = new TextEncoder().encode(input);
  const digestBuffer = await crypto.subtle.digest('SHA-256', bytes);
  const digestBytes = new Uint8Array(digestBuffer);
  let hexOut = '';
  for (let i = 0; i < 3; i++) {
    const b = digestBytes[i] ?? 0;
    hexOut += b.toString(16).padStart(2, '0').toUpperCase();
  }
  return `${hexOut.slice(0, 3)}-${hexOut.slice(3, 6)}`;
}

/**
 * Computes the lowercase 64-character hex SHA-256 digest of a request body.
 * Starts with `await sodium.ready;` on line 1.
 */
export async function computeBodySha256Hex(body: string | Uint8Array = ''): Promise<string> {
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

export interface SyncKeyPair {
  publicKey: Uint8Array;
  privateKey: Uint8Array;
  publicKeyBase64: string;
}

/**
 * Derives a deterministic Ed25519 keypair from the 32-byte Vault `DEK` using
 * Libsodium BLAKE2b subkey derivation (`"VG_AUT_1"`, `AUT_ID = 5`).
 */
export async function deriveSyncAuthKeyPair(dek: Uint8Array): Promise<SyncKeyPair> {
  await sodium.ready;
  if (!(dek instanceof Uint8Array) || dek.byteLength !== DEK_BYTES) {
    throw new Error('SYNC_AUTH_INVALID_DEK_LENGTH');
  }
  const workingDek = new Uint8Array(dek);
  let authSeed: Uint8Array | null = null;
  try {
    authSeed = sodium.crypto_kdf_derive_from_key(
      DEK_BYTES,
      AUT_ID,
      BLAKE2B_CTX_SYNC_AUTH,
      workingDek
    );
    const keyPair = sodium.crypto_sign_seed_keypair(authSeed);
    const publicKeyBase64 = sodium.to_base64(keyPair.publicKey, sodium.base64_variants.ORIGINAL);
    return {
      publicKey: keyPair.publicKey,
      privateKey: keyPair.privateKey,
      publicKeyBase64,
    };
  } finally {
    sodium.memzero(workingDek);
    if (authSeed) {
      sodium.memzero(authSeed);
    }
  }
}

/**
 * Derives a deterministic, device-specific Ed25519 keypair from `(dek, deviceId)`
 * using BLAKE2b (`"VG_DEV_1"`, `DEV_ID = 7`).
 */
export async function deriveDeviceAuthKeyPair(
  dek: Uint8Array,
  deviceId: string
): Promise<SyncKeyPair> {
  await sodium.ready;
  if (!(dek instanceof Uint8Array) || dek.byteLength !== DEK_BYTES) {
    throw new Error('SYNC_AUTH_INVALID_DEK_LENGTH');
  }
  if (typeof deviceId !== 'string' || deviceId.trim().length === 0) {
    throw new Error('SYNC_AUTH_INVALID_DEVICE_ID');
  }
  const workingDek = new Uint8Array(dek);
  let baseSeed: Uint8Array | null = null;
  let deviceSeed: Uint8Array | null = null;
  try {
    baseSeed = sodium.crypto_kdf_derive_from_key(
      DEK_BYTES,
      DEV_ID,
      BLAKE2B_CTX_DEVICE_AUTH,
      workingDek
    );
    deviceSeed = sodium.crypto_generichash(
      DEK_BYTES,
      sodium.from_string(`VG_DEVICE_KEY_V1:${deviceId.trim()}`),
      baseSeed
    );
    const keyPair = sodium.crypto_sign_seed_keypair(deviceSeed);
    const publicKeyBase64 = sodium.to_base64(keyPair.publicKey, sodium.base64_variants.ORIGINAL);
    return {
      publicKey: keyPair.publicKey,
      privateKey: keyPair.privateKey,
      publicKeyBase64,
    };
  } finally {
    sodium.memzero(workingDek);
    if (baseSeed) sodium.memzero(baseSeed);
    if (deviceSeed) sodium.memzero(deviceSeed);
  }
}

/**
 * Derives a mathematically independent Ed25519 Recovery Authority Keypair (`VG_RAU_1`, `RAU_ID = 6`)
 * directly from the 24-Word BIP39 Recovery Phrase (or 32-byte recovery entropy).
 * Because `DEK` is randomly generated and wrapped under `RecoveryKEK`, possessing `DEK` via the
 * Master Password NEVER reveals the Recovery Entropy or this Recovery Authority Private Key.
 */
export async function deriveRecoveryAuthKeyPair(
  recoveryMnemonicOrEntropy: string | Uint8Array
): Promise<SyncKeyPair> {
  await sodium.ready;
  let entropy: Uint8Array;
  if (typeof recoveryMnemonicOrEntropy === 'string') {
    const normalized = recoveryMnemonicOrEntropy.trim().toLowerCase().replace(/\s+/g, ' ');
    if (!validateMnemonic(normalized, wordlist)) {
      throw new Error('ERR_INVALID_RECOVERY_MNEMONIC');
    }
    entropy = new Uint8Array(mnemonicToEntropy(normalized, wordlist));
  } else if (
    recoveryMnemonicOrEntropy instanceof Uint8Array &&
    recoveryMnemonicOrEntropy.byteLength === RECOVERY_ENTROPY_BYTES
  ) {
    entropy = new Uint8Array(recoveryMnemonicOrEntropy);
  } else {
    throw new Error('ERR_INVALID_RECOVERY_ENTROPY');
  }

  let recoverySeed: Uint8Array | null = null;
  try {
    recoverySeed = sodium.crypto_kdf_derive_from_key(
      DEK_BYTES,
      RAU_ID,
      BLAKE2B_CTX_RECOVERY_AUTH,
      entropy
    );
    const keyPair = sodium.crypto_sign_seed_keypair(recoverySeed);
    const publicKeyBase64 = sodium.to_base64(keyPair.publicKey, sodium.base64_variants.ORIGINAL);
    return {
      publicKey: keyPair.publicKey,
      privateKey: keyPair.privateKey,
      publicKeyBase64,
    };
  } finally {
    sodium.memzero(entropy);
    if (recoverySeed) {
      sodium.memzero(recoverySeed);
    }
  }
}

export interface RegistrationProof {
  accountId: string;
  accountAuthPubKey: string;
  deviceAuthPubKey?: string;
  recoveryAuthPubKey?: string;
  preimage: string;
  signature: Uint8Array;
  registrationSignature: string;
}

/**
 * Signs an account registration request (`accountId` + `accountAuthPubKey`)
 * using the `VG_AUT_1` Ed25519 private key derived from `dek`.
 */
export async function signSyncRegistration(
  dek: Uint8Array,
  accountId: string,
  deviceId?: string,
  recoveryMnemonicOrEntropy?: string | Uint8Array
): Promise<RegistrationProof> {
  await sodium.ready;
  const keyPair = await deriveSyncAuthKeyPair(dek);
  let deviceKeyPair: SyncKeyPair | null = null;
  let recoveryKeyPair: SyncKeyPair | null = null;
  try {
    if (deviceId) {
      deviceKeyPair = await deriveDeviceAuthKeyPair(dek, deviceId);
    }
    if (recoveryMnemonicOrEntropy) {
      recoveryKeyPair = await deriveRecoveryAuthKeyPair(recoveryMnemonicOrEntropy);
    }
    const preimage = buildSyncRegisterPreimage(accountId, keyPair.publicKeyBase64);
    const preimageBytes = sodium.from_string(preimage);
    const signature = sodium.crypto_sign_detached(preimageBytes, keyPair.privateKey);
    const registrationSignature = sodium.to_base64(signature, sodium.base64_variants.ORIGINAL);
    return {
      accountId: accountId.trim(),
      accountAuthPubKey: keyPair.publicKeyBase64,
      deviceAuthPubKey: deviceKeyPair?.publicKeyBase64,
      recoveryAuthPubKey: recoveryKeyPair?.publicKeyBase64,
      preimage,
      signature,
      registrationSignature,
    };
  } finally {
    sodium.memzero(keyPair.privateKey);
    if (deviceKeyPair) sodium.memzero(deviceKeyPair.privateKey);
    if (recoveryKeyPair) sodium.memzero(recoveryKeyPair.privateKey);
  }
}

export async function verifySyncRegistrationSignature(
  publicKey: Uint8Array,
  accountId: string,
  accountAuthPubKey: string,
  signature: Uint8Array
): Promise<boolean> {
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

export interface ChallengeSignatureInput {
  challengeNonce: string;
  accountId: string;
  deviceId: string;
  timestamp: number;
  body?: string | Uint8Array;
}

export interface ChallengeProof {
  accountId: string;
  deviceId: string;
  challengeNonce: string;
  timestamp: number;
  bodySha256: string;
  preimage: string;
  signature: Uint8Array;
  signatureBase64: string;
  publicKeyBase64: string;
  headers: Record<string, string>;
}

export async function signSyncChallenge(
  dek: Uint8Array,
  input: ChallengeSignatureInput
): Promise<ChallengeProof> {
  await sodium.ready;
  const keyPair = await deriveSyncAuthKeyPair(dek);
  try {
    const bodySha256 = await computeBodySha256Hex(input.body ?? '');
    const preimage = buildSyncAuthPreimage({
      challengeNonce: input.challengeNonce,
      accountId: input.accountId,
      deviceId: input.deviceId,
      timestamp: input.timestamp,
      bodySha256,
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
        'x-vg-signature': signatureBase64,
      },
    };
  } finally {
    sodium.memzero(keyPair.privateKey);
  }
}

export async function verifySyncChallengeSignature(
  publicKey: Uint8Array,
  preimage: string,
  signature: Uint8Array
): Promise<boolean> {
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

export interface DeviceRequestProof {
  accountId: string;
  deviceId: string;
  deviceAuthPubKey: string;
  challengeNonce: string;
  timestamp: number;
  signatureBase64: string;
  recoveryAuthPubKey?: string;
  recoverySignatureBase64?: string;
  shortCode: string;
}

/**
 * Signs a New Device Authorization request (`POST /v1/device/request`), and optionally
 * attaches a cryptographic 24-Word Recovery Kit bypass proof (`VG_DEVICE_RECOVERY_V1:`).
 */
export async function signDeviceAuthorizationRequest(
  dek: Uint8Array,
  input: {
    challengeNonce: string;
    accountId: string;
    deviceId: string;
    timestamp: number;
    recoveryMnemonicOrEntropy?: string | Uint8Array;
  }
): Promise<DeviceRequestProof> {
  await sodium.ready;
  const accountKeyPair = await deriveSyncAuthKeyPair(dek);
  const deviceKeyPair = await deriveDeviceAuthKeyPair(dek, input.deviceId);
  let recoveryKeyPair: SyncKeyPair | null = null;
  try {
    const preimage = buildDeviceRequestPreimage(
      input.challengeNonce,
      input.accountId,
      input.deviceId,
      deviceKeyPair.publicKeyBase64,
      input.timestamp
    );
    const sigBytes = sodium.crypto_sign_detached(
      sodium.from_string(preimage),
      accountKeyPair.privateKey
    );
    const signatureBase64 = sodium.to_base64(sigBytes, sodium.base64_variants.ORIGINAL);

    let recoveryAuthPubKey: string | undefined;
    let recoverySignatureBase64: string | undefined;

    if (input.recoveryMnemonicOrEntropy) {
      recoveryKeyPair = await deriveRecoveryAuthKeyPair(input.recoveryMnemonicOrEntropy);
      recoveryAuthPubKey = recoveryKeyPair.publicKeyBase64;
      const recPreimage = buildDeviceRecoveryPreimage(
        input.challengeNonce,
        input.accountId,
        input.deviceId,
        deviceKeyPair.publicKeyBase64,
        input.timestamp
      );
      const recSigBytes = sodium.crypto_sign_detached(
        sodium.from_string(recPreimage),
        recoveryKeyPair.privateKey
      );
      recoverySignatureBase64 = sodium.to_base64(recSigBytes, sodium.base64_variants.ORIGINAL);
    }

    const shortCode = await computeDeviceShortCode(
      input.accountId,
      input.deviceId,
      deviceKeyPair.publicKeyBase64
    );

    return {
      accountId: input.accountId,
      deviceId: input.deviceId,
      deviceAuthPubKey: deviceKeyPair.publicKeyBase64,
      challengeNonce: input.challengeNonce,
      timestamp: input.timestamp,
      signatureBase64,
      recoveryAuthPubKey,
      recoverySignatureBase64,
      shortCode,
    };
  } finally {
    sodium.memzero(accountKeyPair.privateKey);
    sodium.memzero(deviceKeyPair.privateKey);
    if (recoveryKeyPair) sodium.memzero(recoveryKeyPair.privateKey);
  }
}

/**
 * Signs a Trusted Device Approval Certificate (`VG_DEVICE_APPROVE_V1:`) for `POST /v1/device/approve`.
 */
export async function signDeviceApprovalDecision(
  dek: Uint8Array,
  input: {
    accountId: string;
    approverDeviceId: string;
    targetDeviceId: string;
    targetDevicePubKey: string;
    approve: boolean;
  }
): Promise<string> {
  await sodium.ready;
  const accountKeyPair = await deriveSyncAuthKeyPair(dek);
  try {
    const preimage = buildDeviceApprovalPreimage(
      input.accountId,
      input.approverDeviceId,
      input.targetDeviceId,
      input.targetDevicePubKey,
      input.approve
    );
    const sigBytes = sodium.crypto_sign_detached(
      sodium.from_string(preimage),
      accountKeyPair.privateKey
    );
    return sodium.to_base64(sigBytes, sodium.base64_variants.ORIGINAL);
  } finally {
    sodium.memzero(accountKeyPair.privateKey);
  }
}
