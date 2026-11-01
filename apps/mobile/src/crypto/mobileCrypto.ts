/**
 * @file apps/mobile/src/crypto/mobileCrypto.ts
 * @description Mobile Cryptographic Lifecycle and Envelope Coordinator.
 */

import {
  createVault,
  unlockWithMaster,
  unlockWithRecovery,
  sealItem,
  unsealItem,
  generatePassword,
  generatePassphrase,
  computeTotp,
} from '@vaultguard/crypto';
import {
  VaultHeader,
  VaultItemPlaintext,
  VaultItemRecord,
  TOTAL_WORDS_BIP39,
  VaultGuardError,
  ERROR_VAULT_CORRUPT,
} from '@vaultguard/shared';
import {
  getVaultMeta,
  saveVaultMeta,
  saveVaultItem,
  getAllVaultItems,
  softDeleteVaultItem,
  StoredMobileItem,
} from '../storage/db';

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

export async function mobileSetupVault(password: string): Promise<{
  mnemonic: string;
  session: MobileSession;
}> {
  const result = await createVault(password);
  saveVaultMeta('header', JSON.stringify(result.header));
  
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
  const headerRaw = getVaultMeta('header');
  if (!headerRaw) {
    throw new VaultGuardError(ERROR_VAULT_CORRUPT);
  }
  const header: VaultHeader = JSON.parse(headerRaw);
  const dek = await unlockWithMaster(password, header);

  activeSession = {
    dek,
    header,
  };
  return activeSession;
}

export async function mobileUnlockWithRecovery(mnemonic: string): Promise<MobileSession> {
  const headerRaw = getVaultMeta('header');
  if (!headerRaw) {
    throw new VaultGuardError(ERROR_VAULT_CORRUPT);
  }
  const header: VaultHeader = JSON.parse(headerRaw);
  const dek = await unlockWithRecovery(mnemonic, header);

  activeSession = {
    dek,
    header,
  };
  return activeSession;
}

export async function mobileSaveItem(item: VaultItemPlaintext): Promise<StoredMobileItem> {
  if (!activeSession) {
    throw new Error('Vault is locked');
  }

  const sealed = await sealItem(item, activeSession.dek);
  const stored: StoredMobileItem = {
    id: sealed.id,
    title: item.title,
    username: item.username || null,
    ciphertext: sealed.ciphertext,
    nonce: sealed.nonce,
    tag: sealed.tag,
    hlc: sealed.hlc,
    updated_at: Date.now(),
    is_deleted: 0,
  };

  saveVaultItem(stored);
  return stored;
}

export async function mobileGetDecryptedItems(): Promise<VaultItemPlaintext[]> {
  if (!activeSession) {
    throw new Error('Vault is locked');
  }

  const records = getAllVaultItems();
  const results: VaultItemPlaintext[] = [];

  for (const rec of records) {
    const sealed: VaultItemRecord = {
      id: rec.id,
      ciphertext: rec.ciphertext,
      nonce: rec.nonce,
      tag: rec.tag,
      hlc: rec.hlc,
      version: 1,
    };
    try {
      const plain = await unsealItem(sealed, activeSession.dek);
      results.push(plain);
    } catch {
      // Skip corrupt individual item without failing the entire vault
    }
  }

  return results;
}

export { generatePassword, generatePassphrase, computeTotp };
