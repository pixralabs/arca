/**
 * @file apps/mobile/src/crypto/mobileCrypto.ts
 * @description Mobile Cryptographic Lifecycle and Envelope Coordinator (Lazy-Loaded & Non-Blocking).
 * Supports Multi-Vault Architecture with per-vault DEK isolation, frame-yielding Argon2id KDF,
 * and chunked/streamed XChaCha20-Poly1305 item decryption.
 */

import type {
  VaultHeader,
  VaultItemPlaintext,
  VaultItemRecord,
} from '@vaultguard/shared';
import { VaultGuardError, ERR_VAULT_CORRUPTED } from '@vaultguard/shared';
import {
  getVaultMeta,
  saveVaultItem,
  getAllVaultItems,
  getVaultItemsMetadata,
  getVaultItemById,
  softDeleteVaultItem,
  StoredMobileItem,
  VaultItemMetadata,
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

export type DecryptedVaultItem = VaultItemPlaintext & {
  id: string;
  type?: 'login' | 'totp' | 'note' | 'wifi';
  totpSecret?: string | null;
  updatedAt?: number;
  deletedAt?: number | null;
  isDecrypted?: boolean;
};

let activeSession: MobileSession | null = null;
const decryptedItemCache = new Map<string, DecryptedVaultItem>();
let backgroundDecryptAbort: { abort: boolean } | null = null;

export function abortBackgroundDecryption(): void {
  if (backgroundDecryptAbort) {
    backgroundDecryptAbort.abort = true;
    backgroundDecryptAbort = null;
  }
}

export function getActiveSession(): MobileSession | null {
  return activeSession;
}

export function clearActiveSession(): void {
  abortBackgroundDecryption();
  decryptedItemCache.clear();
  if (activeSession) {
    activeSession.dek.fill(0);
    activeSession = null;
  }
}

/**
 * Yields execution back to the React Native JS event loop so UI updates,
 * Reanimated shared values, and touch events can flush cleanly.
 */
export function yieldToMainThread(ms: number = 16): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
      salt:
        header.masterSlot.salt instanceof Uint8Array
          ? sodium.to_base64(header.masterSlot.salt, sodium.base64_variants.ORIGINAL)
          : header.masterSlot.salt,
      nonce:
        header.masterSlot.nonce instanceof Uint8Array
          ? sodium.to_base64(header.masterSlot.nonce, sodium.base64_variants.ORIGINAL)
          : header.masterSlot.nonce,
      ciphertext:
        header.masterSlot.ciphertext instanceof Uint8Array
          ? sodium.to_base64(header.masterSlot.ciphertext, sodium.base64_variants.ORIGINAL)
          : header.masterSlot.ciphertext,
    },
    recoverySlot: {
      ...header.recoverySlot,
      nonce:
        header.recoverySlot.nonce instanceof Uint8Array
          ? sodium.to_base64(header.recoverySlot.nonce, sodium.base64_variants.ORIGINAL)
          : header.recoverySlot.nonce,
      ciphertext:
        header.recoverySlot.ciphertext instanceof Uint8Array
          ? sodium.to_base64(header.recoverySlot.ciphertext, sodium.base64_variants.ORIGINAL)
          : header.recoverySlot.ciphertext,
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
  const vaultId =
    'vault_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);

  // Yield before loading and initializing WASM/ASM.js sodium
  await yieldToMainThread(50);
  const sodium = getSodium();
  await sodium.ready;

  // Yield again right before heavy Argon2id KDF derivation
  await yieldToMainThread(50);
  const pwBytes = new TextEncoder().encode(password);
  const { createVault, OWASP_MOBILE_KDF_PARAMS } = getCrypto();
  const result = await createVault(pwBytes, undefined, OWASP_MOBILE_KDF_PARAMS);

  const serialized = serializeHeader(result.header);

  await createVaultRecord(vaultId, cleanName, serialized);
  await AsyncStorage.setItem('@arca_vault_created', 'true').catch(() => { });
  await AsyncStorage.setItem('@arca_active_vault_id', vaultId).catch(() => { });

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
  // 1. Fetch lightweight SQLite vault header first
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
  const vaultId = vaultRecord?.id || 'default_vault';
  const vaultName = vaultRecord?.name || 'Personal Vault';

  if (vaultRecord) {
    header = JSON.parse(vaultRecord.header);
  } else {
    const headerRaw = await getVaultMeta('header');
    if (!headerRaw) {
      throw new VaultGuardError(ERR_VAULT_CORRUPTED);
    }
    header = JSON.parse(headerRaw);
  }

  // 2. Yield to allow the UI thread to finish painting the shimmering skeleton
  await yieldToMainThread(60);

  const sodium = getSodium();
  await sodium.ready;

  // 3. Yield one more frame before Argon2id KDF + MasterSlot XChaCha20 unsealing
  await yieldToMainThread(32);

  const pwBytes = new TextEncoder().encode(password);
  const { unlockWithMaster } = getCrypto();
  const dek = await unlockWithMaster(header, pwBytes);

  await AsyncStorage.setItem('@arca_active_vault_id', vaultId).catch(() => { });

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
  const vaultId = vaultRecord?.id || 'default_vault';
  const vaultName = vaultRecord?.name || 'Personal Vault';

  if (vaultRecord) {
    header = JSON.parse(vaultRecord.header);
  } else {
    const headerRaw = await getVaultMeta('header');
    if (!headerRaw) {
      throw new VaultGuardError(ERR_VAULT_CORRUPTED);
    }
    header = JSON.parse(headerRaw);
  }

  await yieldToMainThread(60);
  const sodium = getSodium();
  await sodium.ready;
  await yieldToMainThread(32);

  const { unlockWithRecovery } = getCrypto();
  const dek = await unlockWithRecovery(header, mnemonic);

  await AsyncStorage.setItem('@arca_active_vault_id', vaultId).catch(() => { });

  activeSession = {
    dek,
    header,
    vaultId,
    vaultName,
  };

  return activeSession;
}

export async function mobileSaveItem(
  item: VaultItemPlaintext & { id?: string; type?: string; deletedAt?: number | null }
): Promise<StoredMobileItem> {
  if (!activeSession) {
    throw new Error('Vault is locked');
  }
  const sodium = getSodium();
  await sodium.ready;

  const itemId =
    item.id || 'item_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
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

  const isTotp = Boolean(item.totpConfig || (item as any).totpSecret || item.type === 'totp');

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
    is_deleted: item.deletedAt ? 1 : 0,
    item_type: isTotp ? 'totp' : (item.type || 'login'),
  };

  await saveVaultItem(stored);

  // Cache in volatile memory immediately
  decryptedItemCache.set(itemId, {
    ...item,
    id: itemId,
    type: isTotp ? 'totp' : ((item.type as any) || 'login'),
    updatedAt: stored.updated_at,
    deletedAt: item.deletedAt ?? null,
    isDecrypted: true,
  });

  return stored;
}

/**
 * Ultra-Fast Metadata Fetch (< 5ms).
 * Reads lightweight SQLite columns (id, title, username, item_type, updated_at, is_deleted)
 * without decrypting any DataEnvelopes, allowing VaultScreen to render instantaneously!
 */
export async function mobileGetVaultMetadataItems(
  includeDeleted = true
): Promise<DecryptedVaultItem[]> {
  if (!activeSession) {
    throw new Error('Vault is locked');
  }
  const currentVaultId = activeSession.vaultId;
  const metaRows = await getVaultItemsMetadata(includeDeleted, currentVaultId);

  return metaRows.map((rec) => {
    const cached = decryptedItemCache.get(rec.id);
    if (cached) {
      return cached;
    }
    const isTotp = rec.item_type === 'totp';
    return {
      id: rec.id,
      title: rec.title,
      username: rec.username || '',
      password: '', // Masked until on-demand decryption
      urls: [],
      notes: '',
      type: (rec.item_type as any) || 'login',
      totpSecret: isTotp ? '••••••••' : null,
      updatedAt: rec.updated_at,
      deletedAt: rec.is_deleted === 1 ? rec.updated_at : null,
      isDecrypted: false,
    };
  });
}

/**
 * On-Demand Decryption:
 * Unseals a single item when the user taps View, Copy Password, or Authenticate TOTP.
 * Checks in-RAM cache first (< 1ms). If missing, reads single row and decrypts with DEK.
 */
export async function mobileDecryptItemOnDemand(
  itemId: string
): Promise<DecryptedVaultItem> {
  if (!activeSession) {
    throw new Error('Vault is locked');
  }
  const cached = decryptedItemCache.get(itemId);
  if (cached && cached.isDecrypted) {
    return cached;
  }

  const rec = await getVaultItemById(itemId);
  if (!rec) {
    throw new Error(`Item ${itemId} not found`);
  }

  const sodium = getSodium();
  await sodium.ready;
  const { unsealItem } = getCrypto();

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

  const plain = await unsealItem(activeSession.dek, recordPayload);
  const isTotp = Boolean(
    rec.item_type === 'totp' ||
    plain.totpSecret ||
    plain.totpConfig ||
    plain.type === 'totp'
  );

  const decrypted: DecryptedVaultItem = {
    ...plain,
    id: rec.id,
    type: isTotp ? 'totp' : ((rec.item_type as any) || plain.type || 'login'),
    updatedAt: rec.updated_at,
    deletedAt: rec.is_deleted === 1 ? rec.updated_at : null,
    isDecrypted: true,
  };

  decryptedItemCache.set(itemId, decrypted);
  return decrypted;
}

/**
 * Progressive Non-Blocking Background Decryption:
 * Decrypts items one by one during idle slices in the background.
 * Updates in-RAM cache and notifies callback so security health and search
 * are fully populated without ever blocking UI animations or transitions.
 */
export async function mobileStartBackgroundDecryption(
  onItemDecrypted?: (item: DecryptedVaultItem) => void,
  onComplete?: (allItems: DecryptedVaultItem[]) => void
): Promise<void> {
  if (!activeSession) return;
  abortBackgroundDecryption();

  const currentAbort = { abort: false };
  backgroundDecryptAbort = currentAbort;

  const currentDek = activeSession.dek;
  const currentVaultId = activeSession.vaultId;

  setTimeout(async () => {
    try {
      const records = await getAllVaultItems(true, currentVaultId);
      if (records.length === 0) return;

      const sodium = getSodium();
      await sodium.ready;
      const { unsealItem } = getCrypto();
      const allDecrypted: DecryptedVaultItem[] = [];

      for (let i = 0; i < records.length; i++) {
        if (currentAbort.abort || !activeSession || activeSession.dek !== currentDek) {
          break;
        }

        const rec = records[i];
        let item = decryptedItemCache.get(rec.id);

        if (!item || !item.isDecrypted) {
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
            const plain = await unsealItem(currentDek, recordPayload);
            const isTotp = Boolean(
              rec.item_type === 'totp' ||
              plain.totpSecret ||
              plain.totpConfig ||
              plain.type === 'totp'
            );
            const unsealed: DecryptedVaultItem = {
              ...plain,
              id: rec.id,
              type: isTotp ? 'totp' : ((rec.item_type as any) || plain.type || 'login'),
              updatedAt: rec.updated_at,
              deletedAt: rec.is_deleted === 1 ? rec.updated_at : null,
              isDecrypted: true,
            };
            item = unsealed;
            decryptedItemCache.set(rec.id, unsealed);
          } catch {
            // Skip corrupted item
          }
        }

        if (item) {
          allDecrypted.push(item);
          onItemDecrypted?.(item);
        }

        // Yield 20ms between items so main thread stays 60fps
        await yieldToMainThread(20);
      }

      if (!currentAbort.abort && activeSession) {
        onComplete?.(allDecrypted);
      }
    } catch (err) {
      console.warn('[mobileCrypto] Background decryption notice:', err);
    }
  }, 120);
}

/**
 * Non-blocking chunked/streamed decryption of SQLite vault items.
 * Decrypts in small batches (`chunkSize = 4`) and yields to the main thread
 * between batches so screen transitions and scrolling remain 60FPS.
 */
export async function mobileGetDecryptedItemsStreamed(
  includeDeleted = true,
  onBatchDecrypted?: (currentItems: VaultItemPlaintext[]) => void,
  chunkSize = 4
): Promise<VaultItemPlaintext[]> {
  if (!activeSession) {
    throw new Error('Vault is locked');
  }
  const currentDek = activeSession.dek;
  const currentVaultId = activeSession.vaultId;

  const sodium = getSodium();
  await sodium.ready;

  const records = await getAllVaultItems(includeDeleted, currentVaultId);
  if (records.length === 0) {
    onBatchDecrypted?.([]);
    return [];
  }

  const results: VaultItemPlaintext[] = [];
  const { unsealItem } = getCrypto();

  for (let i = 0; i < records.length; i++) {
    // Abort gracefully if the user locked the vault mid-stream
    if (!activeSession) break;

    const rec = records[i];
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
      const plain = await unsealItem(currentDek, recordPayload);
      results.push({
        ...plain,
        id: rec.id,
        updatedAt: rec.updated_at,
        deletedAt: rec.is_deleted === 1 ? rec.updated_at : null,
      } as VaultItemPlaintext);
    } catch {
      // Skip corrupt individual item without failing the entire vault
    }

    // Yield every `chunkSize` items to let React render progressive updates
    if ((i + 1) % chunkSize === 0 && i + 1 < records.length) {
      onBatchDecrypted?.([...results]);
      await yieldToMainThread(12);
    }
  }

  onBatchDecrypted?.([...results]);
  return results;
}

export async function mobileGetDecryptedItems(
  includeDeleted = true
): Promise<VaultItemPlaintext[]> {
  return mobileGetDecryptedItemsStreamed(includeDeleted);
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