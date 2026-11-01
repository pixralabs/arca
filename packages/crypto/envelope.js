/**
 * @vaultguard/crypto — 2-Tier Envelope Encryption & Item AEAD (`envelope.ts`)
 * Locked to ENVELOPE_SPEC.md v2 §3–4 & ADR-004:
 * - Every async function starts with `await sodium.ready;` as its first statement.
 * - Uses XChaCha20-Poly1305-IETF (`crypto_aead_xchacha20poly1305_ietf_*`) with 24-byte random nonces.
 * - Binds canonical AAD strings ("vaultguard:v1:master", "vaultguard:v1:recovery",
 *   "vaultguard:v1:item:<id>:<revision>").
 * - Wipes all intermediate secret buffers via `sodium.memzero()` in `finally` blocks.
 */

import sodium from 'libsodium-wrappers-sumo';
import { entropyToMnemonic, mnemonicToEntropy, validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';
import { DEK_BYTES, RECOVERY_ENTROPY_BYTES, SALT_BYTES, AEAD_NONCE_BYTES, AEAD_TAG_BYTES, REC_ID, BLAKE2B_CTX_RECOVERY_KEK, VaultGuardError } from '@vaultguard/shared';
import { deriveMasterKEK, assertValidKdfParams, DEFAULT_DESKTOP_KDF_PARAMS } from './kdf.js';
import { padTo256, unpadFrom256 } from './padding.js';
export const AAD_MASTER_ENVELOPE = 'vaultguard:v1:master';
export const AAD_RECOVERY_ENVELOPE = 'vaultguard:v1:recovery';
export function buildItemAad(itemId, revision) {
  if (typeof itemId !== 'string' || itemId.length === 0) {
    throw new Error('ENVELOPE_INVALID_ITEM_ID');
  }
  if (!Number.isInteger(revision) || revision < 1) {
    throw new Error('ENVELOPE_INVALID_ITEM_REVISION');
  }
  return `vaultguard:v1:item:${itemId}:${revision}`;
}
/**
 * 1. Creates a new Vault by generating a random 32-byte DEK, wrapping it with
 *    MasterKEK (`PasswordProtectedKeyEnvelope`, AAD `"vaultguard:v1:master"`) and
 *    RecoveryKEK (`SecretProtectedKeyEnvelope`, AAD `"vaultguard:v1:recovery"`).
 */
export async function createVault(masterPassword, recoveryEntropy, kdfParams = DEFAULT_DESKTOP_KDF_PARAMS) {
  await sodium.ready; // MUST be first line (Blocker 2C / 8-Function Rule)

  if (!(masterPassword instanceof Uint8Array) || masterPassword.byteLength === 0) {
    throw new Error('ENVELOPE_EMPTY_MASTER_PASSWORD');
  }
  assertValidKdfParams(kdfParams);
  const entropy = recoveryEntropy !== undefined ? new Uint8Array(recoveryEntropy) : sodium.randombytes_buf(RECOVERY_ENTROPY_BYTES);
  if (entropy.byteLength !== RECOVERY_ENTROPY_BYTES) {
    sodium.memzero(entropy);
    throw new Error('ENVELOPE_INVALID_RECOVERY_ENTROPY_LENGTH');
  }
  const dek = sodium.randombytes_buf(DEK_BYTES);
  const masterSalt = sodium.randombytes_buf(SALT_BYTES);
  const masterNonce = sodium.randombytes_buf(AEAD_NONCE_BYTES);
  const recoveryNonce = sodium.randombytes_buf(AEAD_NONCE_BYTES);
  let masterKek = null;
  let recoveryKek = null;
  try {
    const mnemonic = entropyToMnemonic(entropy, wordlist);
    masterKek = await deriveMasterKEK(masterPassword, masterSalt, kdfParams);
    recoveryKek = sodium.crypto_kdf_derive_from_key(DEK_BYTES, REC_ID, BLAKE2B_CTX_RECOVERY_KEK, entropy);
    const masterAad = sodium.from_string(AAD_MASTER_ENVELOPE);
    const recoveryAad = sodium.from_string(AAD_RECOVERY_ENVELOPE);
    const masterCiphertext = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(dek, masterAad, null, masterNonce, masterKek);
    const recoveryCiphertext = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(dek, recoveryAad, null, recoveryNonce, recoveryKek);
    return {
      version: 1,
      masterSlot: {
        version: 1,
        namespace: 'PasswordProtectedKeyEnvelope',
        kdfParams: {
          ...kdfParams
        },
        salt: masterSalt,
        nonce: masterNonce,
        ciphertext: masterCiphertext
      },
      recoverySlot: {
        version: 1,
        namespace: 'SecretProtectedKeyEnvelope',
        nonce: recoveryNonce,
        ciphertext: recoveryCiphertext
      },
      mnemonic
    };
  } finally {
    sodium.memzero(dek);
    sodium.memzero(entropy);
    if (masterKek) sodium.memzero(masterKek);
    if (recoveryKek) sodium.memzero(recoveryKek);
  }
}

/**
 * 2. Unlocks a VaultBlob using the user's Master Password (`Uint8Array`), returning
 *    the unwrapped 32-byte DEK or throwing `VaultGuardError('ERR_WRONG_PASSWORD')`.
 */
export async function unlockWithMaster(blob, masterPassword) {
  await sodium.ready; // MUST be first line

  if (!blob || blob.version !== 1 || !blob.masterSlot) {
    throw new VaultGuardError('ERR_VAULT_CORRUPTED');
  }
  const slot = blob.masterSlot;
  if (slot.version !== 1 || slot.namespace !== 'PasswordProtectedKeyEnvelope' || !(slot.salt instanceof Uint8Array) || slot.salt.byteLength !== SALT_BYTES || !(slot.nonce instanceof Uint8Array) || slot.nonce.byteLength !== AEAD_NONCE_BYTES || !(slot.ciphertext instanceof Uint8Array) || slot.ciphertext.byteLength !== DEK_BYTES + AEAD_TAG_BYTES) {
    throw new VaultGuardError('ERR_VAULT_CORRUPTED');
  }
  assertValidKdfParams(slot.kdfParams);
  let masterKek = null;
  try {
    masterKek = await deriveMasterKEK(masterPassword, slot.salt, slot.kdfParams);
    const masterAad = sodium.from_string(AAD_MASTER_ENVELOPE);
    const dek = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(null, slot.ciphertext, masterAad, slot.nonce, masterKek);
    return dek;
  } catch (err) {
    if (err instanceof VaultGuardError) {
      throw err;
    }
    throw new VaultGuardError('ERR_WRONG_PASSWORD', {
      count: 1,
      backoffSec: 1
    });
  } finally {
    if (masterKek) {
      sodium.memzero(masterKek);
    }
  }
}

/**
 * 3. Unlocks a VaultBlob using the offline 24-word BIP39 Recovery Key mnemonic,
 *    returning the unwrapped 32-byte DEK or throwing `VaultGuardError('ERR_RECOVERY_INVALID')`.
 */
export async function unlockWithRecovery(blob, mnemonic) {
  await sodium.ready; // MUST be first line

  if (!blob || blob.version !== 1 || !blob.recoverySlot) {
    throw new VaultGuardError('ERR_VAULT_CORRUPTED');
  }
  const slot = blob.recoverySlot;
  if (slot.version !== 1 || slot.namespace !== 'SecretProtectedKeyEnvelope' || !(slot.nonce instanceof Uint8Array) || slot.nonce.byteLength !== AEAD_NONCE_BYTES || !(slot.ciphertext instanceof Uint8Array) || slot.ciphertext.byteLength !== DEK_BYTES + AEAD_TAG_BYTES) {
    throw new VaultGuardError('ERR_VAULT_CORRUPTED');
  }
  const normalizedMnemonic = typeof mnemonic === 'string' ? mnemonic.trim().replace(/\s+/g, ' ').normalize('NFKD') : '';
  if (!validateMnemonic(normalizedMnemonic, wordlist)) {
    throw new VaultGuardError('ERR_RECOVERY_INVALID');
  }
  let recoveryEntropy = null;
  let recoveryKek = null;
  try {
    recoveryEntropy = mnemonicToEntropy(normalizedMnemonic, wordlist);
    if (recoveryEntropy.byteLength !== RECOVERY_ENTROPY_BYTES) {
      throw new VaultGuardError('ERR_RECOVERY_INVALID');
    }
    recoveryKek = sodium.crypto_kdf_derive_from_key(DEK_BYTES, REC_ID, BLAKE2B_CTX_RECOVERY_KEK, recoveryEntropy);
    const recoveryAad = sodium.from_string(AAD_RECOVERY_ENVELOPE);
    const dek = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(null, slot.ciphertext, recoveryAad, slot.nonce, recoveryKek);
    return dek;
  } catch (err) {
    if (err instanceof VaultGuardError) {
      throw err;
    }
    throw new VaultGuardError('ERR_RECOVERY_INVALID');
  } finally {
    if (recoveryEntropy) sodium.memzero(recoveryEntropy);
    if (recoveryKek) sodium.memzero(recoveryKek);
  }
}

/**
 * 4. Rotates the Master Password by unwrapping the 32-byte DEK with `oldPw` and
 *    re-wrapping the exact same DEK under `newPw` with a fresh 16-byte salt and
 *    24-byte nonce. Zero vault items need to be re-encrypted, and `recoverySlot`
 *    remains valid.
 */
export async function rotateMasterPassword(blob, oldPw, newPw, newKdfParams) {
  await sodium.ready; // MUST be first line

  if (!(newPw instanceof Uint8Array) || newPw.byteLength === 0) {
    throw new Error('ENVELOPE_EMPTY_NEW_MASTER_PASSWORD');
  }
  const targetKdfParams = newKdfParams ?? blob.masterSlot.kdfParams;
  assertValidKdfParams(targetKdfParams);
  let dek = null;
  let newMasterKek = null;
  try {
    dek = await unlockWithMaster(blob, oldPw);
    const newSalt = sodium.randombytes_buf(SALT_BYTES);
    const newNonce = sodium.randombytes_buf(AEAD_NONCE_BYTES);
    newMasterKek = await deriveMasterKEK(newPw, newSalt, targetKdfParams);
    const masterAad = sodium.from_string(AAD_MASTER_ENVELOPE);
    const newMasterCiphertext = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(dek, masterAad, null, newNonce, newMasterKek);
    return {
      version: 1,
      masterSlot: {
        version: 1,
        namespace: 'PasswordProtectedKeyEnvelope',
        kdfParams: {
          ...targetKdfParams
        },
        salt: newSalt,
        nonce: newNonce,
        ciphertext: newMasterCiphertext
      },
      recoverySlot: blob.recoverySlot
    };
  } finally {
    if (dek) sodium.memzero(dek);
    if (newMasterKek) sodium.memzero(newMasterKek);
  }
}

/**
 * Seals an arbitrary item plaintext Uint8Array into a 256-byte padded DataEnvelope
 * using XChaCha20-Poly1305-IETF (24B random nonce) and AAD `"vaultguard:v1:item:<id>:<revision>"`.
 */
export async function sealItem(dek, itemId, revision, plaintext) {
  await sodium.ready; // MUST be first line

  if (!(dek instanceof Uint8Array) || dek.byteLength !== DEK_BYTES) {
    throw new Error('ENVELOPE_INVALID_DEK_LENGTH');
  }
  const aadString = buildItemAad(itemId, revision);
  const aadBytes = sodium.from_string(aadString);
  const padded = padTo256(plaintext);
  const nonce = sodium.randombytes_buf(AEAD_NONCE_BYTES);
  try {
    const ciphertext = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(padded, aadBytes, null, nonce, dek);
    return {
      version: 1,
      namespace: 'DataEnvelope',
      itemId,
      revision,
      nonce,
      ciphertext
    };
  } finally {
    sodium.memzero(padded);
  }
}

/**
 * Unseals and unpads a 256-byte padded DataEnvelope, verifying the Poly1305 tag
 * over AAD `"vaultguard:v1:item:<id>:<revision>"`.
 */
export async function unsealItem(dek, expectedItemId, expectedRevision, blob) {
  await sodium.ready; // MUST be first line

  if (!(dek instanceof Uint8Array) || dek.byteLength !== DEK_BYTES) {
    throw new Error('ENVELOPE_INVALID_DEK_LENGTH');
  }
  if (!blob || blob.version !== 1 || blob.namespace !== 'DataEnvelope' || blob.itemId !== expectedItemId || blob.revision !== expectedRevision || !(blob.nonce instanceof Uint8Array) || blob.nonce.byteLength !== AEAD_NONCE_BYTES || !(blob.ciphertext instanceof Uint8Array) || blob.ciphertext.byteLength < AEAD_TAG_BYTES) {
    throw new VaultGuardError('ERR_VAULT_CORRUPTED');
  }
  const aadString = buildItemAad(expectedItemId, expectedRevision);
  const aadBytes = sodium.from_string(aadString);
  let padded = null;
  try {
    padded = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(null, blob.ciphertext, aadBytes, blob.nonce, dek);
    return unpadFrom256(padded);
  } catch {
    throw new VaultGuardError('ERR_VAULT_CORRUPTED');
  } finally {
    if (padded) {
      sodium.memzero(padded);
    }
  }
}