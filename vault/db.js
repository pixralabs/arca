/**
 * @file apps/extension/src/vault/db.ts
 * @description IndexedDB Storage Layer (`idb@8.0.4`) with 3 Object Stores:
 * - `vault_meta`: Encrypted VaultHeader, BLAKE2b-signed VaultManifest, monotonic `lastKnownVaultSeq`,
 *   device-local `biometric_slot` (`BiometricProtectedKeyEnvelope`), and opt-in `sync_config`.
 * - `vault_items`: Sealed `VaultItemRecord` entries ONLY (zero plaintext fields).
 * - `session_keystore`: Non-extractable WebCrypto AES-GCM wrapping `CryptoKey` (`extractable: false`).
 */

import { openDB } from 'idb';
import { isValidVaultHeader, isValidVaultItemRecord, isValidVaultManifest, VaultGuardError, ERR_SCHEMA_INVALID } from '@vaultguard/shared';
import { DEFAULT_SYNC_SERVER_URL, validateSyncServerUrl } from '@vaultguard/crypto';
export const DB_NAME = 'vaultguard_db';
export const DB_VERSION = 1;
export const STORE_VAULT_META = 'vault_meta';
export const STORE_VAULT_ITEMS = 'vault_items';
export const STORE_SESSION_KEYSTORE = 'session_keystore';
let dbPromise = null;
export function getVaultDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_VAULT_META)) {
          db.createObjectStore(STORE_VAULT_META);
        }
        if (!db.objectStoreNames.contains(STORE_VAULT_ITEMS)) {
          const itemStore = db.createObjectStore(STORE_VAULT_ITEMS, {
            keyPath: 'id'
          });
          itemStore.createIndex('by-updated', 'updatedAt');
          itemStore.createIndex('by-deleted', 'deletedAt');
        }
        if (!db.objectStoreNames.contains(STORE_SESSION_KEYSTORE)) {
          db.createObjectStore(STORE_SESSION_KEYSTORE, {
            keyPath: 'id'
          });
        }
      }
    });
  }
  return dbPromise;
}
export async function readVaultHeader() {
  const db = await getVaultDB();
  const raw = await db.get(STORE_VAULT_META, 'header');
  if (raw === undefined || raw === null) {
    return null;
  }
  if (!isValidVaultHeader(raw)) {
    throw new VaultGuardError(ERR_SCHEMA_INVALID, {
      field: 'header'
    });
  }
  return raw;
}
export async function writeVaultHeader(header) {
  if (!isValidVaultHeader(header)) {
    throw new VaultGuardError(ERR_SCHEMA_INVALID, {
      field: 'header'
    });
  }
  const db = await getVaultDB();
  await db.put(STORE_VAULT_META, header, 'header');
}
export async function readBiometricSlot() {
  const db = await getVaultDB();
  const raw = await db.get(STORE_VAULT_META, 'biometric_slot');
  if (!raw || raw.namespace !== 'BiometricProtectedKeyEnvelope' || raw.version !== 1) {
    return null;
  }
  return raw;
}
export async function writeBiometricSlot(slot) {
  const db = await getVaultDB();
  await db.put(STORE_VAULT_META, slot, 'biometric_slot');
}
export async function deleteBiometricSlot() {
  const db = await getVaultDB();
  await db.delete(STORE_VAULT_META, 'biometric_slot');
}
export async function readSyncConfig() {
  const db = await getVaultDB();
  const raw = await db.get(STORE_VAULT_META, 'sync_config');
  if (!raw || typeof raw !== 'object') {
    return {
      syncEnabled: false,
      serverUrl: DEFAULT_SYNC_SERVER_URL,
      accountId: '',
      deviceId: ''
    };
  }
  const candidate = raw;
  let normalizedUrl = DEFAULT_SYNC_SERVER_URL;
  try {
    if (typeof candidate.serverUrl === 'string' && candidate.serverUrl.trim().length > 0) {
      normalizedUrl = validateSyncServerUrl(candidate.serverUrl);
    }
  } catch {
    normalizedUrl = DEFAULT_SYNC_SERVER_URL;
  }
  return {
    syncEnabled: Boolean(candidate.syncEnabled),
    serverUrl: normalizedUrl,
    accountId: typeof candidate.accountId === 'string' ? candidate.accountId : '',
    deviceId: typeof candidate.deviceId === 'string' ? candidate.deviceId : ''
  };
}
export async function writeSyncConfig(config) {
  const normalizedUrl = validateSyncServerUrl(config.serverUrl);
  const next = {
    syncEnabled: Boolean(config.syncEnabled),
    serverUrl: normalizedUrl,
    accountId: config.accountId || crypto.randomUUID(),
    deviceId: config.deviceId || crypto.randomUUID()
  };
  const db = await getVaultDB();
  await db.put(STORE_VAULT_META, next, 'sync_config');
  return next;
}
export async function readVaultManifest() {
  const db = await getVaultDB();
  const tx = db.transaction(STORE_VAULT_META, 'readonly');
  const rawManifest = await tx.store.get('manifest');
  const rawSeq = await tx.store.get('lastKnownVaultSeq');
  await tx.done;
  const lastKnownVaultSeq = typeof rawSeq === 'number' && Number.isSafeInteger(rawSeq) && rawSeq >= 0 ? rawSeq : 0;
  if (rawManifest === undefined || rawManifest === null) {
    return {
      manifest: null,
      lastKnownVaultSeq
    };
  }
  if (!isValidVaultManifest(rawManifest)) {
    throw new VaultGuardError(ERR_SCHEMA_INVALID, {
      field: 'manifest'
    });
  }
  return {
    manifest: rawManifest,
    lastKnownVaultSeq
  };
}
export async function writeVaultManifest(manifest) {
  if (!isValidVaultManifest(manifest)) {
    throw new VaultGuardError(ERR_SCHEMA_INVALID, {
      field: 'manifest'
    });
  }
  const db = await getVaultDB();
  const tx = db.transaction(STORE_VAULT_META, 'readwrite');
  const currentSeqRaw = await tx.store.get('lastKnownVaultSeq');
  const currentSeq = typeof currentSeqRaw === 'number' && Number.isSafeInteger(currentSeqRaw) ? currentSeqRaw : 0;
  const nextHighWaterMark = Math.max(currentSeq, manifest.vaultSeq);
  await tx.store.put(manifest, 'manifest');
  await tx.store.put(nextHighWaterMark, 'lastKnownVaultSeq');
  await tx.done;
}
export async function readAllEncryptedItems() {
  const db = await getVaultDB();
  const all = await db.getAll(STORE_VAULT_ITEMS);
  const validated = [];
  for (const record of all) {
    if (!isValidVaultItemRecord(record)) {
      throw new VaultGuardError(ERR_SCHEMA_INVALID, {
        field: 'vault_items'
      });
    }
    validated.push(record);
  }
  return validated;
}
export async function putEncryptedItemAndManifest(record, manifest) {
  if (!isValidVaultItemRecord(record)) {
    throw new VaultGuardError(ERR_SCHEMA_INVALID, {
      field: 'record'
    });
  }
  if (!isValidVaultManifest(manifest)) {
    throw new VaultGuardError(ERR_SCHEMA_INVALID, {
      field: 'manifest'
    });
  }
  const db = await getVaultDB();
  const tx = db.transaction([STORE_VAULT_ITEMS, STORE_VAULT_META], 'readwrite');
  await tx.objectStore(STORE_VAULT_ITEMS).put(record);
  await tx.objectStore(STORE_VAULT_META).put(manifest, 'manifest');
  await tx.objectStore(STORE_VAULT_META).put(manifest.vaultSeq, 'lastKnownVaultSeq');
  await tx.done;
}
export async function saveSessionWrappingKey(key) {
  if (key.extractable) {
    throw new VaultGuardError(ERR_SCHEMA_INVALID, {
      field: 'extractable'
    });
  }
  const db = await getVaultDB();
  const record = {
    id: 'wrapping_key',
    key,
    createdAt: Date.now()
  };
  await db.put(STORE_SESSION_KEYSTORE, record);
}
export async function loadSessionWrappingKey() {
  const db = await getVaultDB();
  const record = await db.get(STORE_SESSION_KEYSTORE, 'wrapping_key');
  if (!record || !record.key || record.key.extractable !== false) {
    return null;
  }
  return record.key;
}
export async function clearSessionKeystore() {
  const db = await getVaultDB();
  await db.clear(STORE_SESSION_KEYSTORE);
}