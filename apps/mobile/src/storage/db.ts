/**
 * @file apps/mobile/src/storage/db.ts
 * @description SQLite Storage Layer for Arca Mobile using @op-engineering/op-sqlite.
 * Supports Multi-Vault Architecture, WAL mode, secure_delete, and isolated vault items.
 */

import type { DB } from '@op-engineering/op-sqlite';
import AsyncStorage from '@react-native-async-storage/async-storage';

let dbInstance: DB | null = null;
let dbInitPromise: Promise<void> | null = null;

export interface VaultRecord {
  id: string;
  name: string;
  header: string;
  created_at: number;
  updated_at: number;
}

export interface StoredMobileItem {
  id: string;
  vault_id?: string | null;
  title: string;
  username: string | null;
  ciphertext: string;
  nonce: string;
  tag: string;
  hlc: string;
  updated_at: number;
  is_deleted: number;
  item_type?: string | null;
}

export interface VaultItemMetadata {
  id: string;
  vault_id?: string | null;
  title: string;
  username: string | null;
  updated_at: number;
  is_deleted: number;
  item_type: string;
}

export function getDatabase(): DB {
  if (!dbInstance) {
    const { open } = require('@op-engineering/op-sqlite');
    dbInstance = open({
      name: 'arca_vault.db',
      location: 'default',
    });
  }
  return dbInstance!;
}

export async function ensureDatabaseReady(): Promise<DB> {
  const db = getDatabase();
  if (!dbInitPromise) {
    dbInitPromise = (async () => {
      await db.execute('PRAGMA journal_mode = WAL;');
      await db.execute('PRAGMA secure_delete = ON;');
      await db.execute('PRAGMA foreign_keys = ON;');

      // 1. Multi-vault table
      await db.execute(`
        CREATE TABLE IF NOT EXISTS vaults (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          header TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );
      `);

      // 2. Vault metadata table (includes vault_id and vault_name)
      await db.execute(`
        CREATE TABLE IF NOT EXISTS vault_meta (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at INTEGER NOT NULL,
          vault_id TEXT,
          vault_name TEXT
        );
      `);

      // 3. Vault items table (namespaced by vault_id)
      await db.execute(`
        CREATE TABLE IF NOT EXISTS vault_items (
          id TEXT PRIMARY KEY,
          vault_id TEXT,
          title TEXT NOT NULL,
          username TEXT,
          ciphertext TEXT NOT NULL,
          nonce TEXT NOT NULL,
          tag TEXT NOT NULL,
          hlc TEXT NOT NULL,
          updated_at INTEGER NOT NULL,
          is_deleted INTEGER NOT NULL DEFAULT 0,
          item_type TEXT DEFAULT 'login'
        );
      `);

      // 4. Sync state table
      await db.execute(`
        CREATE TABLE IF NOT EXISTS sync_state (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
      `);

      // Safely apply column additions for pre-existing databases
      try {
        await db.execute('ALTER TABLE vault_meta ADD COLUMN vault_id TEXT;');
      } catch {}
      try {
        await db.execute('ALTER TABLE vault_meta ADD COLUMN vault_name TEXT;');
      } catch {}
      try {
        await db.execute('ALTER TABLE vault_items ADD COLUMN vault_id TEXT;');
      } catch {}
      try {
        await db.execute("ALTER TABLE vault_items ADD COLUMN item_type TEXT DEFAULT 'login';");
      } catch {}

      // Backward compatibility: Migrate legacy single-vault into vaults table
      try {
        const legacyHeaderRes = await db.execute("SELECT value FROM vault_meta WHERE key = 'header' LIMIT 1;");
        if (legacyHeaderRes.rows && legacyHeaderRes.rows.length > 0) {
          const legacyHeader = (legacyHeaderRes.rows.item(0) as { value: string }).value;
          const vaultsCountRes = await db.execute('SELECT COUNT(*) as count FROM vaults;');
          const count = vaultsCountRes.rows ? (vaultsCountRes.rows.item(0) as { count: number }).count : 0;
          if (count === 0 && legacyHeader) {
            const defaultVaultId = 'vault_personal';
            const defaultVaultName = 'Personal Vault';
            const now = Date.now();
            await db.execute(
              'INSERT OR REPLACE INTO vaults (id, name, header, created_at, updated_at) VALUES (?, ?, ?, ?, ?);',
              [defaultVaultId, defaultVaultName, legacyHeader, now, now]
            );
            await db.execute(
              'UPDATE vault_items SET vault_id = ? WHERE vault_id IS NULL OR vault_id = ?;',
              [defaultVaultId, '']
            );
            await db.execute(
              'UPDATE vault_meta SET vault_id = ?, vault_name = ? WHERE vault_id IS NULL;',
              [defaultVaultId, defaultVaultName]
            );
            await AsyncStorage.setItem('@arca_active_vault_id', defaultVaultId).catch(() => {});
          }
        }
      } catch (err) {
        console.warn('[db] Legacy migration notice:', err);
      }
    })();
  }
  await dbInitPromise;
  return db;
}

// ─── Vault Operations ────────────────────────────────────────────────────────

export async function createVaultRecord(id: string, name: string, header: string): Promise<VaultRecord> {
  const db = await ensureDatabaseReady();
  const now = Date.now();
  await db.execute(
    'INSERT OR REPLACE INTO vaults (id, name, header, created_at, updated_at) VALUES (?, ?, ?, ?, ?);',
    [id, name, header, now, now]
  );
  // Also track in vault_meta for legacy/metadata consumers
  await db.execute(
    'INSERT OR REPLACE INTO vault_meta (key, value, updated_at, vault_id, vault_name) VALUES (?, ?, ?, ?, ?);',
    [`header_${id}`, header, now, id, name]
  );
  await db.execute(
    'INSERT OR REPLACE INTO vault_meta (key, value, updated_at, vault_id, vault_name) VALUES (?, ?, ?, ?, ?);',
    ['header', header, now, id, name]
  );
  return { id, name, header, created_at: now, updated_at: now };
}

export async function getAllVaults(): Promise<VaultRecord[]> {
  const db = await ensureDatabaseReady();
  const res = await db.execute('SELECT * FROM vaults ORDER BY created_at ASC;');
  const vaults: VaultRecord[] = [];
  if (res.rows) {
    for (let i = 0; i < res.rows.length; i++) {
      vaults.push(res.rows.item(i) as VaultRecord);
    }
  }
  return vaults;
}

export async function getVaultRecordById(id: string): Promise<VaultRecord | null> {
  const db = await ensureDatabaseReady();
  const res = await db.execute('SELECT * FROM vaults WHERE id = ? LIMIT 1;', [id]);
  if (res.rows && res.rows.length > 0) {
    return res.rows.item(0) as VaultRecord;
  }
  return null;
}

export async function deleteVault(id: string): Promise<void> {
  const db = await ensureDatabaseReady();
  await db.execute('DELETE FROM vaults WHERE id = ?;', [id]);
  await db.execute('DELETE FROM vault_items WHERE vault_id = ?;', [id]);
  await db.execute('DELETE FROM vault_meta WHERE vault_id = ?;', [id]);
}

// ─── Metadata Operations ─────────────────────────────────────────────────────

export async function saveVaultMeta(
  key: string,
  value: string,
  vaultId?: string,
  vaultName?: string
): Promise<void> {
  const db = await ensureDatabaseReady();
  await db.execute(
    'INSERT OR REPLACE INTO vault_meta (key, value, updated_at, vault_id, vault_name) VALUES (?, ?, ?, ?, ?);',
    [key, value, Date.now(), vaultId || null, vaultName || null]
  );
}

export async function getVaultMeta(key: string): Promise<string | null> {
  const db = await ensureDatabaseReady();
  const res = await db.execute('SELECT value FROM vault_meta WHERE key = ? LIMIT 1;', [key]);
  if (res.rows && res.rows.length > 0) {
    return (res.rows.item(0) as { value: string }).value;
  }
  return null;
}

export async function deleteVaultMeta(key: string): Promise<void> {
  const db = await ensureDatabaseReady();
  await db.execute('DELETE FROM vault_meta WHERE key = ?;', [key]);
}

// ─── Vault Items Operations ──────────────────────────────────────────────────

export async function saveVaultItem(item: StoredMobileItem): Promise<void> {
  const db = await ensureDatabaseReady();
  await db.execute(
    `INSERT OR REPLACE INTO vault_items 
     (id, vault_id, title, username, ciphertext, nonce, tag, hlc, updated_at, is_deleted, item_type)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
    [
      item.id,
      item.vault_id || null,
      item.title,
      item.username,
      item.ciphertext,
      item.nonce,
      item.tag,
      item.hlc,
      item.updated_at,
      item.is_deleted,
      item.item_type || 'login',
    ]
  );
}

/**
 * High-performance lightweight metadata query (< 5ms).
 * Omits heavy ciphertext and nonce columns so VaultScreen renders instantly.
 */
export async function getVaultItemsMetadata(
  includeDeleted = false,
  vaultId?: string
): Promise<VaultItemMetadata[]> {
  const db = await ensureDatabaseReady();
  let query: string;
  const params: any[] = [];

  if (vaultId) {
    query = includeDeleted
      ? 'SELECT id, vault_id, title, username, updated_at, is_deleted, item_type FROM vault_items WHERE (vault_id = ? OR vault_id IS NULL) ORDER BY updated_at DESC;'
      : 'SELECT id, vault_id, title, username, updated_at, is_deleted, item_type FROM vault_items WHERE (vault_id = ? OR vault_id IS NULL) AND is_deleted = 0 ORDER BY updated_at DESC;';
    params.push(vaultId);
  } else {
    query = includeDeleted
      ? 'SELECT id, vault_id, title, username, updated_at, is_deleted, item_type FROM vault_items ORDER BY updated_at DESC;'
      : 'SELECT id, vault_id, title, username, updated_at, is_deleted, item_type FROM vault_items WHERE is_deleted = 0 ORDER BY updated_at DESC;';
  }

  const res = await db.execute(query, params);
  const items: VaultItemMetadata[] = [];
  if (res.rows) {
    for (let i = 0; i < res.rows.length; i++) {
      const row = res.rows.item(i) as any;
      items.push({
        id: row.id,
        vault_id: row.vault_id,
        title: row.title,
        username: row.username,
        updated_at: row.updated_at,
        is_deleted: row.is_deleted,
        item_type: row.item_type || 'login',
      });
    }
  }
  return items;
}

export async function getVaultItemById(id: string): Promise<StoredMobileItem | null> {
  const db = await ensureDatabaseReady();
  const res = await db.execute('SELECT * FROM vault_items WHERE id = ? LIMIT 1;', [id]);
  if (res.rows && res.rows.length > 0) {
    return res.rows.item(0) as StoredMobileItem;
  }
  return null;
}

export async function getAllVaultItems(
  includeDeleted = false,
  vaultId?: string
): Promise<StoredMobileItem[]> {
  const db = await ensureDatabaseReady();
  let query: string;
  const params: any[] = [];

  if (vaultId) {
    query = includeDeleted
      ? 'SELECT * FROM vault_items WHERE (vault_id = ? OR vault_id IS NULL) ORDER BY updated_at DESC;'
      : 'SELECT * FROM vault_items WHERE (vault_id = ? OR vault_id IS NULL) AND is_deleted = 0 ORDER BY updated_at DESC;';
    params.push(vaultId);
  } else {
    query = includeDeleted
      ? 'SELECT * FROM vault_items ORDER BY updated_at DESC;'
      : 'SELECT * FROM vault_items WHERE is_deleted = 0 ORDER BY updated_at DESC;';
  }

  const res = await db.execute(query, params);
  const items: StoredMobileItem[] = [];
  if (res.rows) {
    for (let i = 0; i < res.rows.length; i++) {
      items.push(res.rows.item(i) as StoredMobileItem);
    }
  }
  return items;
}

export async function softDeleteVaultItem(id: string, hlc: string): Promise<void> {
  const db = await ensureDatabaseReady();
  await db.execute(
    'UPDATE vault_items SET is_deleted = 1, hlc = ?, updated_at = ? WHERE id = ?;',
    [hlc, Date.now(), id]
  );
}

export async function purgeAllVaultData(): Promise<void> {
  const db = await ensureDatabaseReady();
  await db.execute('DELETE FROM vault_items;');
  await db.execute('DELETE FROM vault_meta;');
  await db.execute('DELETE FROM vaults;');
  await db.execute('DELETE FROM sync_state;');
  await db.execute('VACUUM;');
  await AsyncStorage.removeItem('@arca_vault_created').catch(() => {});
  await AsyncStorage.removeItem('@arca_active_vault_id').catch(() => {});
}
