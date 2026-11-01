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
import {
  DEK_BYTES,
  RECOVERY_ENTROPY_BYTES,
  SALT_BYTES,
  AEAD_NONCE_BYTES,
  AEAD_TAG_BYTES,
  REC_ID,
  BLAKE2B_CTX_RECOVERY_KEK,
  VaultGuardError,
  KdfParams,
  VaultHeader,
  PasswordProtectedKeyEnvelope,
  SecretProtectedKeyEnvelope,
  VaultItemRecord,
  VaultItemPlaintext,
} from '@vaultguard/shared';
import { deriveMasterKEK, assertValidKdfParams, DEFAULT_DESKTOP_KDF_PARAMS } from './kdf.js';
import { padTo256, unpadFrom256 } from './padding.js';

export const AAD_MASTER_ENVELOPE = 'vaultguard:v1:master';
export const AAD_RECOVERY_ENVELOPE = 'vaultguard:v1:recovery';

export function buildItemAad(itemId: string, revision: number): string {
  if (typeof itemId !== 'string' || itemId.length === 0) {
    throw new Error('ENVELOPE_INVALID_ITEM_ID');
  }
  if (!Number.isInteger(revision) || revision < 1) {
    throw new Error('ENVELOPE_INVALID_ITEM_REVISION');
  }
  return `vaultguard:v1:item:${itemId}:${revision}`;
}

export interface CreateVaultResult {
  version: 1;
  header: VaultHeader;
  dek: Uint8Array;
  recoveryMnemonic: string;
  masterSlot: PasswordProtectedKeyEnvelope;
  recoverySlot: SecretProtectedKeyEnvelope;
  mnemonic: string;
}

/**
 * 1. Creates a new Vault by generating a random 32-byte DEK, wrapping it with
 *    MasterKEK (`PasswordProtectedKeyEnvelope`, AAD `"vaultguard:v1:master"`) and
 *    RecoveryKEK (`SecretProtectedKeyEnvelope`, AAD `"vaultguard:v1:recovery"`).
 */
export async function createVault(
  masterPassword: Uint8Array,
  recoveryEntropy?: Uint8Array | KdfParams,
  kdfParams: KdfParams = DEFAULT_DESKTOP_KDF_PARAMS
): Promise<CreateVaultResult> {
  await sodium.ready; // MUST be first line

  let actualEntropy: Uint8Array | undefined;
  let actualKdfParams = kdfParams;

  if (recoveryEntropy instanceof Uint8Array) {
    actualEntropy = recoveryEntropy;
  } else if (typeof recoveryEntropy === 'object' && recoveryEntropy !== null) {
    actualKdfParams = recoveryEntropy;
  }

  if (!(masterPassword instanceof Uint8Array) || masterPassword.byteLength === 0) {
    throw new Error('ENVELOPE_EMPTY_MASTER_PASSWORD');
  }
  assertValidKdfParams(actualKdfParams);

  const entropy =
    actualEntropy !== undefined
      ? new Uint8Array(actualEntropy)
      : sodium.randombytes_buf(RECOVERY_ENTROPY_BYTES);
  if (entropy.byteLength !== RECOVERY_ENTROPY_BYTES) {
    sodium.memzero(entropy);
    throw new Error('ENVELOPE_INVALID_RECOVERY_ENTROPY_LENGTH');
  }

  const dek = sodium.randombytes_buf(DEK_BYTES);
  const masterSalt = sodium.randombytes_buf(SALT_BYTES);
  const masterNonce = sodium.randombytes_buf(AEAD_NONCE_BYTES);
  const recoveryNonce = sodium.randombytes_buf(AEAD_NONCE_BYTES);

  let masterKek: Uint8Array | null = null;
  let recoveryKek: Uint8Array | null = null;

  try {
    const mnemonic = entropyToMnemonic(entropy, wordlist);
    masterKek = await deriveMasterKEK(masterPassword, masterSalt, actualKdfParams);
    recoveryKek = sodium.crypto_kdf_derive_from_key(
      DEK_BYTES,
      REC_ID,
      BLAKE2B_CTX_RECOVERY_KEK,
      entropy
    );

    const masterAad = sodium.from_string(AAD_MASTER_ENVELOPE);
    const recoveryAad = sodium.from_string(AAD_RECOVERY_ENVELOPE);

    const masterCiphertext = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
      dek,
      masterAad,
      null,
      masterNonce,
      masterKek
    );
    const recoveryCiphertext = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
      dek,
      recoveryAad,
      null,
      recoveryNonce,
      recoveryKek
    );

    const now = Date.now();
    const masterSlot: PasswordProtectedKeyEnvelope = {
      version: 1,
      namespace: 'PasswordProtectedKeyEnvelope',
      kdfParams: { ...actualKdfParams },
      salt: masterSalt,
      nonce: masterNonce,
      ciphertext: masterCiphertext,
      createdAt: now,
    };

    const recoverySlot: SecretProtectedKeyEnvelope = {
      version: 1,
      namespace: 'SecretProtectedKeyEnvelope',
      nonce: recoveryNonce,
      ciphertext: recoveryCiphertext,
      createdAt: now,
    };

    const header: VaultHeader = {
      version: 1,
      keyVersion: 1,
      masterSlot,
      recoverySlot,
      createdAt: now,
      updatedAt: now,
    };

    return {
      version: 1,
      header,
      dek: new Uint8Array(dek),
      recoveryMnemonic: mnemonic,
      masterSlot,
      recoverySlot,
      mnemonic,
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
export async function unlockWithMaster(
  blobOrPassword: VaultHeader | Uint8Array,
  passwordOrBlob?: Uint8Array | VaultHeader
): Promise<Uint8Array> {
  await sodium.ready; // MUST be first line

  const header: VaultHeader =
    (blobOrPassword instanceof Uint8Array ? passwordOrBlob : blobOrPassword) as VaultHeader;
  const masterPassword: Uint8Array =
    (blobOrPassword instanceof Uint8Array ? blobOrPassword : passwordOrBlob) as Uint8Array;

  if (!header || header.version !== 1 || !header.masterSlot) {
    throw new VaultGuardError('ERR_VAULT_CORRUPTED');
  }
  const slot = header.masterSlot;
  const salt = slot.salt instanceof Uint8Array ? slot.salt : sodium.from_base64(slot.salt as string, sodium.base64_variants.ORIGINAL);
  const nonce = slot.nonce instanceof Uint8Array ? slot.nonce : sodium.from_base64(slot.nonce as string, sodium.base64_variants.ORIGINAL);
  const ciphertext = slot.ciphertext instanceof Uint8Array ? slot.ciphertext : sodium.from_base64(slot.ciphertext as string, sodium.base64_variants.ORIGINAL);

  assertValidKdfParams(slot.kdfParams);
  let masterKek: Uint8Array | null = null;
  try {
    masterKek = await deriveMasterKEK(masterPassword, salt, slot.kdfParams);
    const masterAad = sodium.from_string(AAD_MASTER_ENVELOPE);
    const dek = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
      null,
      ciphertext,
      masterAad,
      nonce,
      masterKek
    );
    return dek;
  } catch (err) {
    if (err instanceof VaultGuardError) {
      throw err;
    }
    throw new VaultGuardError('ERR_WRONG_PASSWORD', {
      count: 1,
      backoffSec: 1,
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
export async function unlockWithRecovery(
  mnemonicOrBlob: string | VaultHeader,
  blobOrMnemonic?: VaultHeader | string
): Promise<Uint8Array> {
  await sodium.ready; // MUST be first line

  const header: VaultHeader = (typeof mnemonicOrBlob === 'string' ? blobOrMnemonic : mnemonicOrBlob) as VaultHeader;
  const mnemonic: string = (typeof mnemonicOrBlob === 'string' ? mnemonicOrBlob : blobOrMnemonic) as string;

  if (!header || header.version !== 1 || !header.recoverySlot) {
    throw new VaultGuardError('ERR_VAULT_CORRUPTED');
  }
  const slot = header.recoverySlot;
  const nonce = slot.nonce instanceof Uint8Array ? slot.nonce : sodium.from_base64(slot.nonce as string, sodium.base64_variants.ORIGINAL);
  const ciphertext = slot.ciphertext instanceof Uint8Array ? slot.ciphertext : sodium.from_base64(slot.ciphertext as string, sodium.base64_variants.ORIGINAL);

  const normalizedMnemonic = typeof mnemonic === 'string' ? mnemonic.trim().replace(/\s+/g, ' ').normalize('NFKD') : '';
  if (!validateMnemonic(normalizedMnemonic, wordlist)) {
    throw new VaultGuardError('ERR_RECOVERY_INVALID');
  }
  let recoveryEntropy: Uint8Array | null = null;
  let recoveryKek: Uint8Array | null = null;
  try {
    recoveryEntropy = mnemonicToEntropy(normalizedMnemonic, wordlist);
    if (recoveryEntropy.byteLength !== RECOVERY_ENTROPY_BYTES) {
      throw new VaultGuardError('ERR_RECOVERY_INVALID');
    }
    recoveryKek = sodium.crypto_kdf_derive_from_key(
      DEK_BYTES,
      REC_ID,
      BLAKE2B_CTX_RECOVERY_KEK,
      recoveryEntropy
    );
    const recoveryAad = sodium.from_string(AAD_RECOVERY_ENVELOPE);
    const dek = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
      null,
      ciphertext,
      recoveryAad,
      nonce,
      recoveryKek
    );
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
 * 4. Rotates Master Password.
 */
export async function rotateMasterPassword(
  dekOrBlob: Uint8Array | VaultHeader,
  oldPwOrNewPw: Uint8Array,
  newPwOrHeader?: Uint8Array | VaultHeader,
  newKdfParams?: KdfParams
): Promise<VaultHeader> {
  await sodium.ready; // MUST be first line

  let dek: Uint8Array;
  let newPw: Uint8Array;
  let header: VaultHeader;

  if (dekOrBlob instanceof Uint8Array) {
    dek = dekOrBlob;
    newPw = oldPwOrNewPw;
    header = newPwOrHeader as VaultHeader;
  } else {
    header = dekOrBlob;
    const oldPw = oldPwOrNewPw;
    newPw = newPwOrHeader as Uint8Array;
    dek = await unlockWithMaster(header, oldPw);
  }

  if (!(newPw instanceof Uint8Array) || newPw.byteLength === 0) {
    throw new Error('ENVELOPE_EMPTY_NEW_MASTER_PASSWORD');
  }
  const targetKdfParams = newKdfParams ?? header.masterSlot.kdfParams;
  assertValidKdfParams(targetKdfParams);

  let newMasterKek: Uint8Array | null = null;
  try {
    const newSalt = sodium.randombytes_buf(SALT_BYTES);
    const newNonce = sodium.randombytes_buf(AEAD_NONCE_BYTES);
    newMasterKek = await deriveMasterKEK(newPw, newSalt, targetKdfParams);
    const masterAad = sodium.from_string(AAD_MASTER_ENVELOPE);
    const newMasterCiphertext = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
      dek,
      masterAad,
      null,
      newNonce,
      newMasterKek
    );
    const now = Date.now();
    return {
      version: 1,
      keyVersion: header.keyVersion + 1,
      masterSlot: {
        version: 1,
        namespace: 'PasswordProtectedKeyEnvelope',
        kdfParams: { ...targetKdfParams },
        salt: newSalt,
        nonce: newNonce,
        ciphertext: newMasterCiphertext,
        createdAt: now,
      },
      recoverySlot: header.recoverySlot,
      biometricSlot: header.biometricSlot,
      createdAt: header.createdAt,
      updatedAt: now,
    };
  } finally {
    if (newMasterKek) sodium.memzero(newMasterKek);
  }
}

/**
 * Seals an arbitrary item plaintext into a 256-byte padded DataEnvelope.
 * Supports both signatures:
 *   sealItem(dek, itemId, revision, plaintext)
 *   sealItem(dek, plaintext, metadata)
 */
export async function sealItem(
  dek: Uint8Array,
  arg2: string | VaultItemPlaintext | Uint8Array,
  arg3?: number | Partial<VaultItemRecord>,
  arg4?: Uint8Array | VaultItemPlaintext
): Promise<VaultItemRecord> {
  await sodium.ready; // MUST be first line

  if (!(dek instanceof Uint8Array) || dek.byteLength !== DEK_BYTES) {
    throw new Error('ENVELOPE_INVALID_DEK_LENGTH');
  }

  let itemId: string;
  let revision: number;
  let rawBytes: Uint8Array;
  let metadata: Partial<VaultItemRecord> = {};

  if (typeof arg2 === 'string' && typeof arg3 === 'number') {
    itemId = arg2;
    revision = arg3;
    const content = arg4!;
    rawBytes = content instanceof Uint8Array ? content : sodium.from_string(JSON.stringify(content));
  } else {
    const plaintext = arg2 as VaultItemPlaintext | Uint8Array;
    metadata = (arg3 as Partial<VaultItemRecord>) || {};
    itemId = metadata.id ?? crypto.randomUUID();
    revision = metadata.revision ?? 1;
    rawBytes = plaintext instanceof Uint8Array ? plaintext : sodium.from_string(JSON.stringify(plaintext));
  }

  const aadString = buildItemAad(itemId, revision);
  const aadBytes = sodium.from_string(aadString);
  const padded = padTo256(rawBytes);
  const nonce = sodium.randombytes_buf(AEAD_NONCE_BYTES);

  try {
    const ciphertext = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
      padded,
      aadBytes,
      null,
      nonce,
      dek
    );
    const now = Date.now();
    return {
      id: itemId,
      schemaVersion: 1,
      revision,
      nonce,
      ciphertext,
      createdAt: metadata.createdAt ?? now,
      updatedAt: metadata.updatedAt ?? now,
      deletedAt: metadata.deletedAt ?? null,
    };
  } finally {
    sodium.memzero(padded);
  }
}

/**
 * Unseals and unpads a 256-byte padded DataEnvelope.
 * Supports both signatures:
 *   unsealItem(dek, expectedItemId, expectedRevision, blob)
 *   unsealItem(dek, record)
 */
export async function unsealItem(
  dek: Uint8Array,
  arg2: string | VaultItemRecord,
  arg3?: number,
  arg4?: VaultItemRecord | { nonce: Uint8Array; ciphertext: Uint8Array }
): Promise<any> {
  await sodium.ready; // MUST be first line

  if (!(dek instanceof Uint8Array) || dek.byteLength !== DEK_BYTES) {
    throw new Error('ENVELOPE_INVALID_DEK_LENGTH');
  }

  let expectedItemId: string;
  let expectedRevision: number;
  let nonce: Uint8Array;
  let ciphertext: Uint8Array;

  if (typeof arg2 === 'string') {
    expectedItemId = arg2;
    expectedRevision = arg3!;
    const blob = arg4!;
    nonce = blob.nonce instanceof Uint8Array ? blob.nonce : sodium.from_base64(blob.nonce as string, sodium.base64_variants.ORIGINAL);
    ciphertext = blob.ciphertext instanceof Uint8Array ? blob.ciphertext : sodium.from_base64(blob.ciphertext as string, sodium.base64_variants.ORIGINAL);
  } else {
    const record = arg2 as VaultItemRecord;
    expectedItemId = record.id;
    expectedRevision = record.revision;
    nonce = record.nonce instanceof Uint8Array ? record.nonce : sodium.from_base64(record.nonce as string, sodium.base64_variants.ORIGINAL);
    ciphertext = record.ciphertext instanceof Uint8Array ? record.ciphertext : sodium.from_base64(record.ciphertext as string, sodium.base64_variants.ORIGINAL);
  }

  const aadString = buildItemAad(expectedItemId, expectedRevision);
  const aadBytes = sodium.from_string(aadString);
  let padded: Uint8Array | null = null;
  try {
    padded = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
      null,
      ciphertext,
      aadBytes,
      nonce,
      dek
    );
    const unpadded = unpadFrom256(padded);
    try {
      const jsonStr = sodium.to_string(unpadded);
      return JSON.parse(jsonStr);
    } catch {
      return unpadded;
    }
  } catch {
    throw new VaultGuardError('ERR_VAULT_CORRUPTED');
  } finally {
    if (padded) {
      sodium.memzero(padded);
    }
  }
}
