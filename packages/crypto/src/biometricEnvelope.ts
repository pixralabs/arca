/**
 * @vaultguard/crypto — WebAuthn PRF Biometric Key Wrapping (`biometricEnvelope.ts`)
 * Locked to BIOMETRICS_SPEC.md v1.0 & ARCHITECTURE.md v4.1:
 * - Every async function starts with `await sodium.ready;` on its very first line.
 * - Derives a 32-byte `biometricKEK` from the 32-byte WebAuthn `prf` extension output
 *   using Libsodium BLAKE2b (`"VG_BIO_1"`, `BIO_ID = 4`).
 * - Wraps and unwraps the 32-byte `DEK` using `XChaCha20-Poly1305-IETF` with canonical
 *   AAD `"vaultguard:v2:biometric:<credentialId>"`.
 */

import sodium from 'libsodium-wrappers-sumo';
import {
  DEK_BYTES,
  AEAD_NONCE_BYTES,
  AEAD_TAG_BYTES,
  BIO_ID,
  BLAKE2B_CTX_BIOMETRIC_KEK,
  AAD_BIOMETRIC_PREFIX,
  VaultGuardError,
  BiometricProtectedKeyEnvelope,
} from '@vaultguard/shared';

export function buildBiometricAad(credentialId: string): string {
  if (typeof credentialId !== 'string' || credentialId.trim().length === 0) {
    throw new Error('BIOMETRIC_INVALID_CREDENTIAL_ID');
  }
  return `${AAD_BIOMETRIC_PREFIX}${credentialId}`;
}

/**
 * Derives a 32-byte `biometricKEK` from a 32-byte WebAuthn PRF hardware evaluation
 * using Libsodium BLAKE2b subkey derivation (`"VG_BIO_1"`, `BIO_ID = 4`).
 */
export async function deriveBiometricKEK(prfOutput: Uint8Array): Promise<Uint8Array> {
  await sodium.ready;
  if (!(prfOutput instanceof Uint8Array) || prfOutput.byteLength !== DEK_BYTES) {
    throw new Error('BIOMETRIC_INVALID_PRF_OUTPUT_LENGTH');
  }
  const workingPrf = new Uint8Array(prfOutput);
  try {
    return sodium.crypto_kdf_derive_from_key(
      DEK_BYTES,
      BIO_ID,
      BLAKE2B_CTX_BIOMETRIC_KEK,
      workingPrf
    );
  } finally {
    sodium.memzero(workingPrf);
  }
}

/**
 * Seals the 32-byte Vault `DEK` under `biometricKek` (`XChaCha20-Poly1305-IETF`)
 * bound to the WebAuthn `credentialId` via canonical AAD.
 */
export async function sealBiometricSlot(
  dek: Uint8Array,
  biometricKek: Uint8Array,
  credentialId: string,
  prfSalt?: Uint8Array
): Promise<BiometricProtectedKeyEnvelope> {
  await sodium.ready;
  if (!(dek instanceof Uint8Array) || dek.byteLength !== DEK_BYTES) {
    throw new Error('BIOMETRIC_INVALID_DEK_LENGTH');
  }
  if (!(biometricKek instanceof Uint8Array) || biometricKek.byteLength !== DEK_BYTES) {
    throw new Error('BIOMETRIC_INVALID_KEK_LENGTH');
  }

  const aadString = buildBiometricAad(credentialId);
  const aadBytes = sodium.from_string(aadString);
  const nonce = sodium.randombytes_buf(AEAD_NONCE_BYTES);
  const workingKek = new Uint8Array(biometricKek);

  try {
    const ciphertext = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
      dek,
      aadBytes,
      null,
      nonce,
      workingKek
    );
    return {
      version: 1,
      namespace: 'BiometricProtectedKeyEnvelope',
      credentialId,
      prfSalt: prfSalt ? new Uint8Array(prfSalt) : undefined,
      nonce,
      ciphertext,
      failedAttempts: 0,
      createdAt: Date.now(),
    };
  } finally {
    sodium.memzero(workingKek);
  }
}

/**
 * Unseals a `BiometricProtectedKeyEnvelope` (`EncryptedSlot`) using `biometricKek`
 * and returns the 32-byte `DEK`.
 */
export async function unsealBiometricSlot(
  slot: BiometricProtectedKeyEnvelope,
  biometricKek: Uint8Array
): Promise<Uint8Array> {
  await sodium.ready;
  if (!(biometricKek instanceof Uint8Array) || biometricKek.byteLength !== DEK_BYTES) {
    throw new Error('BIOMETRIC_INVALID_KEK_LENGTH');
  }
  if (
    !slot ||
    slot.version !== 1 ||
    slot.namespace !== 'BiometricProtectedKeyEnvelope' ||
    typeof slot.credentialId !== 'string' ||
    slot.credentialId.length === 0
  ) {
    throw new VaultGuardError('ERR_VAULT_CORRUPTED');
  }

  const nonce =
    slot.nonce instanceof Uint8Array
      ? slot.nonce
      : sodium.from_base64(slot.nonce as string, sodium.base64_variants.ORIGINAL);
  const ciphertext =
    slot.ciphertext instanceof Uint8Array
      ? slot.ciphertext
      : sodium.from_base64(slot.ciphertext as string, sodium.base64_variants.ORIGINAL);

  if (nonce.byteLength !== AEAD_NONCE_BYTES || ciphertext.byteLength !== DEK_BYTES + AEAD_TAG_BYTES) {
    throw new VaultGuardError('ERR_VAULT_CORRUPTED');
  }

  const aadString = buildBiometricAad(slot.credentialId);
  const aadBytes = sodium.from_string(aadString);
  const workingKek = new Uint8Array(biometricKek);

  try {
    return sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
      null,
      ciphertext,
      aadBytes,
      nonce,
      workingKek
    );
  } catch {
    throw new VaultGuardError('ERR_WRONG_PASSWORD', {
      count: 1,
      backoffSec: 1,
    });
  } finally {
    sodium.memzero(workingKek);
  }
}
