/**
 * @file apps/mobile/src/storage/db.ts
 * @description SQLite Storage Layer for Arca Mobile using @op-engineering/op-sqlite.
 * Enforces PRAGMA journal_mode = WAL, PRAGMA secure_delete = ON, and PRAGMA foreign_keys = ON.
 */

import type { DB } from '@op-engineering/op-sqlite';
import AsyncStorage from '@react-native-async-storage/async-storage';

let dbInstance: DB | null = null;
let dbInitPromise: Promise<void> | null = null;

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

      // Initialize Tables
      await db.execute(`
        CREATE TABLE IF NOT EXISTS vault_meta (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at INTEGER NOT NULL
        );
      `);

      await db.execute(`
        CREATE TABLE IF NOT EXISTS vault_items (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          username TEXT,
          ciphertext TEXT NOT NULL,
          nonce TEXT NOT NULL,
          tag TEXT NOT NULL,
          hlc TEXT NOT NULL,
          updated_at INTEGER NOT NULL,
          is_deleted INTEGER NOT NULL DEFAULT 0
        );
      `);

      await db.execute(`
        CREATE TABLE IF NOT EXISTS sync_state (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
      `);
    })();
  }
  await dbInitPromise;
  return db;
}

export async function saveVaultMeta(key: string, value: string): Promise<void> {
  const db = await ensureDatabaseReady();
  await db.execute(
    'INSERT OR REPLACE INTO vault_meta (key, value, updated_at) VALUES (?, ?, ?);',
    [key, value, Date.now()]
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

export interface StoredMobileItem {
  id: string;
  title: string;
  username: string | null;
  ciphertext: string;
  nonce: string;
  tag: string;
  hlc: string;
  updated_at: number;
  is_deleted: number;
}

export async function saveVaultItem(item: StoredMobileItem): Promise<void> {
  const db = await ensureDatabaseReady();
  await db.execute(
    `INSERT OR REPLACE INTO vault_items 
     (id, title, username, ciphertext, nonce, tag, hlc, updated_at, is_deleted)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
    [
      item.id,
      item.title,
      item.username,
      item.ciphertext,
      item.nonce,
      item.tag,
      item.hlc,
      item.updated_at,
      item.is_deleted,
    ]
  );
}

export async function getAllVaultItems(includeDeleted = false): Promise<StoredMobileItem[]> {
  const db = await ensureDatabaseReady();
  const query = includeDeleted
    ? 'SELECT * FROM vault_items ORDER BY updated_at DESC;'
    : 'SELECT * FROM vault_items WHERE is_deleted = 0 ORDER BY updated_at DESC;';
  const res = await db.execute(query);
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
  await db.execute('DELETE FROM sync_state;');
  await db.execute('VACUUM;');
  await AsyncStorage.removeItem('@arca_vault_created').catch(() => {});
}
