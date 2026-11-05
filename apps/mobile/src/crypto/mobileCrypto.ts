/**
 * @file apps/mobile/src/crypto/mobileCrypto.ts
 * @description Mobile Cryptographic Lifecycle and Envelope Coordinator (Lazy-Loaded).
 * Defers libsodium and @vaultguard/crypto execution until invoked by user actions.
 */

import type {
  VaultHeader,
  VaultItemPlaintext,
  VaultItemRecord,
} from '@vaultguard/shared';
import { VaultGuardError, ERR_VAULT_CORRUPTED } from '@vaultguard/shared';
import {
  getVaultMeta,
  saveVaultMeta,
  saveVaultItem,
  getAllVaultItems,
  softDeleteVaultItem,
  StoredMobileItem,
} from '../storage/db';
import AsyncStorage from '@react-native-async-storage/async-storage';

let _sodium: any = null;
function getSodium(): any {
  if (!_sodium) {
    _sodium = require('libsodium-wrappers-sumo');
  }
  return _sodium;
}

let _crypto: any = null;
function getCrypto(): any {
  if (!_crypto) {
    _crypto = require('@vaultguard/crypto');
  }
  return _crypto;
}

export interface MobileSession {
  dek: Uint8Array;
  header: VaultHeader;
}

let activeSession: MobileSession | null = null;

export function getActiveSession(): MobileSession | null {
  return activeSession;
}

export function clearActiveSession(): void {
  if (activeSession) {
    activeSession.dek.fill(0);
    activeSession = null;
  }
}

export async function computeTotp(
  secretOrUri: string
): Promise<{ code: string; formattedCode: string; remainingSeconds: number; period: number }> {
  const { generateTotpCode } = getCrypto();
  const result = await generateTotpCode(secretOrUri);
  return {
    code: result.code,
    formattedCode: result.formattedCode,
    remainingSeconds: result.remainingSeconds,
    period: result.period,
  };
}

function serializeHeader(header: VaultHeader): string {
  const sodium = getSodium();
  const cloned: any = {
    ...header,
    masterSlot: {
      ...header.masterSlot,
      salt: header.masterSlot.salt instanceof Uint8Array ? sodium.to_base64(header.masterSlot.salt, sodium.base64_variants.ORIGINAL) : header.masterSlot.salt,
      nonce: header.masterSlot.nonce instanceof Uint8Array ? sodium.to_base64(header.masterSlot.nonce, sodium.base64_variants.ORIGINAL) : header.masterSlot.nonce,
      ciphertext: header.masterSlot.ciphertext instanceof Uint8Array ? sodium.to_base64(header.masterSlot.ciphertext, sodium.base64_variants.ORIGINAL) : header.masterSlot.ciphertext,
    },
    recoverySlot: {
      ...header.recoverySlot,
      nonce: header.recoverySlot.nonce instanceof Uint8Array ? sodium.to_base64(header.recoverySlot.nonce, sodium.base64_variants.ORIGINAL) : header.recoverySlot.nonce,
      ciphertext: header.recoverySlot.ciphertext instanceof Uint8Array ? sodium.to_base64(header.recoverySlot.ciphertext, sodium.base64_variants.ORIGINAL) : header.recoverySlot.ciphertext,
    },
  };
  return JSON.stringify(cloned);
}

export async function mobileSetupVault(password: string): Promise<{
  mnemonic: string;
  session: MobileSession;
}> {
  console.log('[mobileSetupVault] starting...');
  const sodium = getSodium();
  await sodium.ready;
  console.log('[mobileSetupVault] sodium is ready');
  const pwBytes = new TextEncoder().encode(password);
  console.log('[mobileSetupVault] calling createVault...');
  const { createVault, OWASP_MOBILE_KDF_PARAMS } = getCrypto();
  const result = await createVault(pwBytes, undefined, OWASP_MOBILE_KDF_PARAMS);
  console.log('[mobileSetupVault] createVault returned! Saving header...');
  await saveVaultMeta('header', serializeHeader(result.header));
  await AsyncStorage.setItem('@arca_vault_created', 'true').catch(() => {});
  console.log('[mobileSetupVault] header saved!');

  activeSession = {
    dek: result.dek,
    header: result.header,
  };

  return {
    mnemonic: result.mnemonic,
    session: activeSession,
  };
}

export async function mobileUnlockVault(password: string): Promise<MobileSession> {
  console.log('[mobileCrypto] mobileUnlockVault starting...');
  const sodium = getSodium();
  await sodium.ready;
  console.log('[mobileCrypto] sodium is ready');
  const headerRaw = await getVaultMeta('header');
  if (!headerRaw) {
    throw new VaultGuardError(ERR_VAULT_CORRUPTED);
  }
  const header: VaultHeader = JSON.parse(headerRaw);
  console.log('[mobileCrypto] masterSlot.kdfParams:', JSON.stringify(header.masterSlot?.kdfParams));
  const pwBytes = new TextEncoder().encode(password);
  console.log('[mobileCrypto] running unlockWithMaster...');
  const { unlockWithMaster } = getCrypto();
  const dek = await unlockWithMaster(header, pwBytes);
  console.log('[mobileCrypto] unlockWithMaster SUCCESS, dek len:', dek.length);

  activeSession = {
    dek,
    header,
  };
  return activeSession;
}

export async function mobileUnlockWithRecovery(mnemonic: string): Promise<MobileSession> {
  const sodium = getSodium();
  await sodium.ready;
  const headerRaw = await getVaultMeta('header');
  if (!headerRaw) {
    throw new VaultGuardError(ERR_VAULT_CORRUPTED);
  }
  const header: VaultHeader = JSON.parse(headerRaw);
  const { unlockWithRecovery } = getCrypto();
  const dek = await unlockWithRecovery(header, mnemonic);

  activeSession = {
    dek,
    header,
  };
  return activeSession;
}

export async function mobileSaveItem(
  item: VaultItemPlaintext & { id?: string }
): Promise<StoredMobileItem> {
  if (!activeSession) {
    throw new Error('Vault is locked');
  }
  const sodium = getSodium();
  await sodium.ready;

  const itemId = item.id || 'item_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
  const { sealItem } = getCrypto();
  const sealed = await sealItem(activeSession.dek, itemId, 1, item);

  const nonceB64 =
    sealed.nonce instanceof Uint8Array
      ? sodium.to_base64(sealed.nonce, sodium.base64_variants.ORIGINAL)
      : String(sealed.nonce);

  const ciphertextB64 =
    sealed.ciphertext instanceof Uint8Array
      ? sodium.to_base64(sealed.ciphertext, sodium.base64_variants.ORIGINAL)
      : String(sealed.ciphertext);

  const stored: StoredMobileItem = {
    id: itemId,
    title: item.title,
    username: item.username || null,
    ciphertext: ciphertextB64,
    nonce: nonceB64,
    tag: '',
    hlc: `${Date.now()}:0:mobile`,
    updated_at: Date.now(),
    is_deleted: 0,
  };

  await saveVaultItem(stored);
  return stored;
}

export async function mobileGetDecryptedItems(
  includeDeleted = true
): Promise<VaultItemPlaintext[]> {
  if (!activeSession) {
    throw new Error('Vault is locked');
  }
  const sodium = getSodium();
  await sodium.ready;

  const records = await getAllVaultItems(includeDeleted);
  const results: VaultItemPlaintext[] = [];
  const { unsealItem } = getCrypto();

  for (const rec of records) {
    const recordPayload: VaultItemRecord = {
      id: rec.id,
      schemaVersion: 1,
      revision: 1,
      ciphertext: rec.ciphertext,
      nonce: rec.nonce,
      createdAt: rec.updated_at,
      updatedAt: rec.updated_at,
      deletedAt: rec.is_deleted === 1 ? rec.updated_at : null,
    };
    try {
      const plain = await unsealItem(activeSession.dek, recordPayload);
      results.push({
        ...plain,
        id: rec.id,
        updatedAt: rec.updated_at,
        deletedAt: rec.is_deleted === 1 ? rec.updated_at : null,
      } as VaultItemPlaintext);
    } catch {
      // Skip corrupt individual item without failing the entire vault
    }
  }

  return results;
}

export async function generatePassword(opts?: any) {
  return getCrypto().generatePassword(opts);
}

export async function generatePassphrase(opts?: any) {
  return getCrypto().generatePassphrase(opts);
}

export async function generateTotpCode(secretOrUri: string) {
  return getCrypto().generateTotpCode(secretOrUri);
}

export { softDeleteVaultItem };
