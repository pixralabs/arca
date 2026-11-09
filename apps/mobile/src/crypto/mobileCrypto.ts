/**
 * @file apps/mobile/src/crypto/mobileCrypto.ts
 * @description Mobile Cryptographic Lifecycle and Envelope Coordinator (Lazy-Loaded).
 * Supports Multi-Vault Architecture with per-vault DEK isolation and named vault metadata.
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
  createVaultRecord,
  getAllVaults,
  getVaultRecordById,
  VaultRecord,
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
  vaultId: string;
  vaultName: string;
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

export async function mobileSetupVault(
  password: string,
  vaultName: string = 'Personal Vault'
): Promise<{
  mnemonic: string;
  session: MobileSession;
  vaultId: string;
  vaultName: string;
}> {
  const cleanName = vaultName.trim() || 'Personal Vault';
  const vaultId = 'vault_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);

  console.log(`[mobileSetupVault] starting for "${cleanName}" (${vaultId})...`);
  const sodium = getSodium();
  await sodium.ready;

  const pwBytes = new TextEncoder().encode(password);
  const { createVault, OWASP_MOBILE_KDF_PARAMS } = getCrypto();
  const result = await createVault(pwBytes, undefined, OWASP_MOBILE_KDF_PARAMS);
  const serialized = serializeHeader(result.header);

  // Save in multi-vault store and set as current active vault
  await createVaultRecord(vaultId, cleanName, serialized);
  await AsyncStorage.setItem('@arca_vault_created', 'true').catch(() => {});
  await AsyncStorage.setItem('@arca_active_vault_id', vaultId).catch(() => {});

  activeSession = {
    dek: result.dek,
    header: result.header,
    vaultId,
    vaultName: cleanName,
  };

  return {
    mnemonic: result.mnemonic,
    session: activeSession,
    vaultId,
    vaultName: cleanName,
  };
}

export async function mobileUnlockVault(
  password: string,
  targetVaultId?: string
): Promise<MobileSession> {
  console.log('[mobileCrypto] mobileUnlockVault starting for vault:', targetVaultId || 'active/default');
  const sodium = getSodium();
  await sodium.ready;

  let vaultRecord: VaultRecord | null = null;
  if (targetVaultId) {
    vaultRecord = await getVaultRecordById(targetVaultId);
  }
  if (!vaultRecord) {
    const savedActiveId = await AsyncStorage.getItem('@arca_active_vault_id').catch(() => null);
    if (savedActiveId) {
      vaultRecord = await getVaultRecordById(savedActiveId);
    }
  }
  if (!vaultRecord) {
    const all = await getAllVaults();
    if (all.length > 0) {
      vaultRecord = all[0];
    }
  }

  let header: VaultHeader;
  let vaultId = vaultRecord?.id || 'default_vault';
  let vaultName = vaultRecord?.name || 'Personal Vault';

  if (vaultRecord) {
    header = JSON.parse(vaultRecord.header);
  } else {
    const headerRaw = await getVaultMeta('header');
    if (!headerRaw) {
      throw new VaultGuardError(ERR_VAULT_CORRUPTED);
    }
    header = JSON.parse(headerRaw);
  }

  const pwBytes = new TextEncoder().encode(password);
  const { unlockWithMaster } = getCrypto();
  const dek = await unlockWithMaster(header, pwBytes);

  await AsyncStorage.setItem('@arca_active_vault_id', vaultId).catch(() => {});

  activeSession = {
    dek,
    header,
    vaultId,
    vaultName,
  };
  return activeSession;
}

export async function mobileUnlockWithRecovery(
  mnemonic: string,
  targetVaultId?: string
): Promise<MobileSession> {
  const sodium = getSodium();
  await sodium.ready;

  let vaultRecord: VaultRecord | null = null;
  if (targetVaultId) {
    vaultRecord = await getVaultRecordById(targetVaultId);
  }
  if (!vaultRecord) {
    const savedActiveId = await AsyncStorage.getItem('@arca_active_vault_id').catch(() => null);
    if (savedActiveId) {
      vaultRecord = await getVaultRecordById(savedActiveId);
    }
  }
  if (!vaultRecord) {
    const all = await getAllVaults();
    if (all.length > 0) {
      vaultRecord = all[0];
    }
  }

  let header: VaultHeader;
  let vaultId = vaultRecord?.id || 'default_vault';
  let vaultName = vaultRecord?.name || 'Personal Vault';

  if (vaultRecord) {
    header = JSON.parse(vaultRecord.header);
  } else {
    const headerRaw = await getVaultMeta('header');
    if (!headerRaw) {
      throw new VaultGuardError(ERR_VAULT_CORRUPTED);
    }
    header = JSON.parse(headerRaw);
  }

  const { unlockWithRecovery } = getCrypto();
  const dek = await unlockWithRecovery(header, mnemonic);

  await AsyncStorage.setItem('@arca_active_vault_id', vaultId).catch(() => {});

  activeSession = {
    dek,
    header,
    vaultId,
    vaultName,
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
    vault_id: activeSession.vaultId,
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

  const records = await getAllVaultItems(includeDeleted, activeSession.vaultId);
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

export { softDeleteVaultItem, getAllVaults, getVaultRecordById };
export type { VaultRecord };
