/**
 * @file apps/mobile/src/storage/db.ts
 * @description SQLite Storage Layer for Arca Mobile using @op-engineering/op-sqlite.
 * Enforces PRAGMA journal_mode = WAL, PRAGMA secure_delete = ON, and PRAGMA foreign_keys = ON.
 */

import { open } from '@op-engineering/op-sqlite';

let dbInstance: ReturnType<typeof open> | null = null;

export function getDatabase() {
  if (dbInstance) {
    return dbInstance;
  }

  dbInstance = open({
    name: 'arca_vault.db',
    location: 'default',
  });

  // Critical SQLite Security Pragmas
  dbInstance.execute('PRAGMA journal_mode = WAL;');
  dbInstance.execute('PRAGMA secure_delete = ON;');
  dbInstance.execute('PRAGMA foreign_keys = ON;');

  // Initialize Tables
  dbInstance.execute(`
    CREATE TABLE IF NOT EXISTS vault_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  dbInstance.execute(`
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

  dbInstance.execute(`
    CREATE TABLE IF NOT EXISTS sync_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  return dbInstance;
}

export function saveVaultMeta(key: string, value: string): void {
  const db = getDatabase();
  db.execute(
    'INSERT OR REPLACE INTO vault_meta (key, value, updated_at) VALUES (?, ?, ?);',
    [key, value, Date.now()]
  );
}

export function getVaultMeta(key: string): string | null {
  const db = getDatabase();
  const res = db.execute('SELECT value FROM vault_meta WHERE key = ? LIMIT 1;', [key]);
  if (res.rows && res.rows.length > 0) {
    return (res.rows.item(0) as { value: string }).value;
  }
  return null;
}

export function deleteVaultMeta(key: string): void {
  const db = getDatabase();
  db.execute('DELETE FROM vault_meta WHERE key = ?;', [key]);
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

export function saveVaultItem(item: StoredMobileItem): void {
  const db = getDatabase();
  db.execute(
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

export function getAllVaultItems(includeDeleted = false): StoredMobileItem[] {
  const db = getDatabase();
  const query = includeDeleted
    ? 'SELECT * FROM vault_items ORDER BY updated_at DESC;'
    : 'SELECT * FROM vault_items WHERE is_deleted = 0 ORDER BY updated_at DESC;';
  const res = db.execute(query);
  const items: StoredMobileItem[] = [];
  if (res.rows) {
    for (let i = 0; i < res.rows.length; i++) {
      items.push(res.rows.item(i) as StoredMobileItem);
    }
  }
  return items;
}

export function softDeleteVaultItem(id: string, hlc: string): void {
  const db = getDatabase();
  db.execute(
    'UPDATE vault_items SET is_deleted = 1, hlc = ?, updated_at = ? WHERE id = ?;',
    [hlc, Date.now(), id]
  );
}

export function purgeAllVaultData(): void {
  const db = getDatabase();
  db.execute('DELETE FROM vault_items;');
  db.execute('DELETE FROM vault_meta;');
  db.execute('DELETE FROM sync_state;');
  db.execute('VACUUM;');
}
