//! apps/relay-server/src/db.rs
//! SQLite Database Layer enforcing WAL Mode & PRAGMA secure_delete = ON.

use std::sync::Arc;
use tokio::sync::Mutex;
use rusqlite::{params, Connection, Result};

use crate::crdt::SyncItemRecord;

#[derive(Clone)]
pub struct Db {
    conn: Arc<Mutex<Connection>>,
}

#[derive(Debug, Clone)]
pub struct AccountRow {
    pub account_id: String,
    pub device_id: String,
    pub account_auth_pub_key: String,
    pub encrypted_header: String,
    pub encrypted_manifest: Option<String>,
    pub vault_seq: u64,
}

#[derive(Debug, Clone)]
pub struct ShareRow {
    pub share_id: String,
    pub encrypted_payload: String,
    pub burn_token: String,
    pub expires_at: i64,
    pub max_views: i32,
    pub view_count: i32,
}

impl Db {
    pub fn open(database_url: &str) -> Result<Self> {
        let path = database_url
            .trim_start_matches("sqlite://")
            .trim_start_matches("sqlite:");
        
        let conn = if path == ":memory:" || path.is_empty() {
            Connection::open_in_memory()?
        } else {
            Connection::open(path)?
        };

        // Enforce SQLite security and integrity pragmas
        conn.execute_batch(
            r#"
            PRAGMA journal_mode = WAL;
            PRAGMA secure_delete = ON;
            PRAGMA foreign_keys = ON;
            "#,
        )?;

        // Run initial migrations
        let migration_sql = include_str!("../migrations/0001_initial.sql");
        conn.execute_batch(migration_sql)?;

        Ok(Self {
            conn: Arc::new(Mutex::new(conn)),
        })
    }

    // --- Accounts ---

    pub async fn register_or_update_account(
        &self,
        account_id: &str,
        device_id: &str,
        account_auth_pub_key: &str,
        encrypted_header: &str,
    ) -> Result<u64> {
        let conn = self.conn.lock().await;
        let now = chrono::Utc::now().timestamp_millis();

        let mut stmt = conn.prepare(
            "SELECT vault_seq FROM accounts WHERE account_id = ?1",
        )?;
        let existing = stmt.query_row(params![account_id], |row| row.get::<_, i64>(0));

        match existing {
            Ok(seq) => {
                conn.execute(
                    r#"
                    UPDATE accounts
                    SET device_id = ?1, account_auth_pub_key = ?2, encrypted_header = ?3, updated_at = ?4
                    WHERE account_id = ?5
                    "#,
                    params![device_id, account_auth_pub_key, encrypted_header, now, account_id],
                )?;
                Ok(seq as u64)
            }
            Err(_) => {
                conn.execute(
                    r#"
                    INSERT INTO accounts (account_id, device_id, account_auth_pub_key, encrypted_header, encrypted_manifest, vault_seq, created_at, updated_at)
                    VALUES (?1, ?2, ?3, ?4, NULL, 1, ?5, ?5)
                    "#,
                    params![account_id, device_id, account_auth_pub_key, encrypted_header, now],
                )?;
                Ok(1)
            }
        }
    }

    pub async fn get_account(&self, account_id: &str) -> Result<Option<AccountRow>> {
        let conn = self.conn.lock().await;
        let mut stmt = conn.prepare(
            r#"
            SELECT account_id, device_id, account_auth_pub_key, encrypted_header, encrypted_manifest, vault_seq
            FROM accounts
            WHERE account_id = ?1
            "#,
        )?;

        let mut rows = stmt.query(params![account_id])?;
        if let Some(row) = rows.next()? {
            let seq: i64 = row.get(5)?;
            Ok(Some(AccountRow {
                account_id: row.get(0)?,
                device_id: row.get(1)?,
                account_auth_pub_key: row.get(2)?,
                encrypted_header: row.get(3)?,
                encrypted_manifest: row.get(4)?,
                vault_seq: seq as u64,
            }))
        } else {
            Ok(None)
        }
    }

    pub async fn delete_account(&self, account_id: &str) -> Result<()> {
        let conn = self.conn.lock().await;
        conn.execute("DELETE FROM sync_items WHERE account_id = ?1", params![account_id])?;
        conn.execute("DELETE FROM auth_challenges WHERE account_id = ?1", params![account_id])?;
        conn.execute("DELETE FROM accounts WHERE account_id = ?1", params![account_id])?;
        Ok(())
    }

    // --- Challenges ---

    pub async fn save_challenge(
        &self,
        challenge_nonce: &str,
        account_id: &str,
        device_id: &str,
        expires_at: i64,
    ) -> Result<()> {
        let conn = self.conn.lock().await;
        conn.execute(
            r#"
            INSERT INTO auth_challenges (challenge_nonce, account_id, device_id, expires_at, consumed)
            VALUES (?1, ?2, ?3, ?4, 0)
            "#,
            params![challenge_nonce, account_id, device_id, expires_at],
        )?;
        Ok(())
    }

    pub async fn consume_challenge(
        &self,
        challenge_nonce: &str,
        account_id: &str,
        device_id: &str,
    ) -> Result<bool> {
        let conn = self.conn.lock().await;
        let now = chrono::Utc::now().timestamp_millis();

        let updated = conn.execute(
            r#"
            UPDATE auth_challenges
            SET consumed = 1
            WHERE challenge_nonce = ?1 AND account_id = ?2 AND device_id = ?3 AND consumed = 0 AND expires_at > ?4
            "#,
            params![challenge_nonce, account_id, device_id, now],
        )?;

        Ok(updated > 0)
    }

    // --- Sync Items ---

    pub async fn get_sync_items_since(
        &self,
        account_id: &str,
        since_seq: u64,
    ) -> Result<Vec<SyncItemRecord>> {
        let conn = self.conn.lock().await;
        let mut stmt = conn.prepare(
            r#"
            SELECT item_id, revision, nonce_base64, ciphertext_base64, hlc_timestamp, deleted_at, updated_at
            FROM sync_items
            WHERE account_id = ?1 AND vault_seq > ?2
            ORDER BY vault_seq ASC
            "#,
        )?;

        let rows = stmt.query_map(params![account_id, since_seq as i64], |row| {
            Ok(SyncItemRecord {
                item_id: row.get(0)?,
                revision: row.get(1)?,
                nonce_base64: row.get(2)?,
                ciphertext_base64: row.get(3)?,
                hlc_timestamp: row.get(4)?,
                deleted_at: row.get(5)?,
                updated_at: row.get(6)?,
            })
        })?;

        let mut items = Vec::new();
        for item in rows {
            items.push(item?);
        }
        Ok(items)
    }

    pub async fn get_existing_item(
        &self,
        account_id: &str,
        item_id: &str,
    ) -> Result<Option<SyncItemRecord>> {
        let conn = self.conn.lock().await;
        let mut stmt = conn.prepare(
            r#"
            SELECT item_id, revision, nonce_base64, ciphertext_base64, hlc_timestamp, deleted_at, updated_at
            FROM sync_items
            WHERE account_id = ?1 AND item_id = ?2
            "#,
        )?;

        let mut rows = stmt.query(params![account_id, item_id])?;
        if let Some(row) = rows.next()? {
            Ok(Some(SyncItemRecord {
                item_id: row.get(0)?,
                revision: row.get(1)?,
                nonce_base64: row.get(2)?,
                ciphertext_base64: row.get(3)?,
                hlc_timestamp: row.get(4)?,
                deleted_at: row.get(5)?,
                updated_at: row.get(6)?,
            }))
        } else {
            Ok(None)
        }
    }

    pub async fn upsert_sync_item(
        &self,
        account_id: &str,
        item: &SyncItemRecord,
        new_vault_seq: u64,
    ) -> Result<()> {
        let conn = self.conn.lock().await;
        conn.execute(
            r#"
            INSERT INTO sync_items (account_id, item_id, revision, nonce_base64, ciphertext_base64, hlc_timestamp, deleted_at, updated_at, vault_seq)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
            ON CONFLICT(account_id, item_id) DO UPDATE SET
                revision = excluded.revision,
                nonce_base64 = excluded.nonce_base64,
                ciphertext_base64 = excluded.ciphertext_base64,
                hlc_timestamp = excluded.hlc_timestamp,
                deleted_at = excluded.deleted_at,
                updated_at = excluded.updated_at,
                vault_seq = excluded.vault_seq
            "#,
            params![
                account_id,
                item.item_id,
                item.revision,
                item.nonce_base64,
                item.ciphertext_base64,
                item.hlc_timestamp,
                item.deleted_at,
                item.updated_at,
                new_vault_seq as i64,
            ],
        )?;
        Ok(())
    }

    pub async fn update_account_vault_seq_and_manifest(
        &self,
        account_id: &str,
        new_vault_seq: u64,
        manifest: Option<&str>,
    ) -> Result<()> {
        let conn = self.conn.lock().await;
        let now = chrono::Utc::now().timestamp_millis();
        conn.execute(
            r#"
            UPDATE accounts
            SET vault_seq = ?1, encrypted_manifest = COALESCE(?2, encrypted_manifest), updated_at = ?3
            WHERE account_id = ?4
            "#,
            params![new_vault_seq as i64, manifest, now, account_id],
        )?;
        Ok(())
    }

    // --- Ephemeral Shares ---

    pub async fn create_share(
        &self,
        share_id: &str,
        encrypted_payload: &str,
        burn_token: &str,
        expires_at: i64,
        max_views: i32,
    ) -> Result<()> {
        let conn = self.conn.lock().await;
        let now = chrono::Utc::now().timestamp_millis();
        conn.execute(
            r#"
            INSERT INTO shares (share_id, encrypted_payload, burn_token, expires_at, max_views, view_count, created_at)
            VALUES (?1, ?2, ?3, ?4, ?5, 0, ?6)
            "#,
            params![share_id, encrypted_payload, burn_token, expires_at, max_views, now],
        )?;
        Ok(())
    }

    pub async fn get_share(&self, share_id: &str) -> Result<Option<ShareRow>> {
        let conn = self.conn.lock().await;
        let now = chrono::Utc::now().timestamp_millis();
        let mut stmt = conn.prepare(
            r#"
            SELECT share_id, encrypted_payload, burn_token, expires_at, max_views, view_count
            FROM shares
            WHERE share_id = ?1 AND expires_at > ?2 AND view_count < max_views
            "#,
        )?;

        let mut rows = stmt.query(params![share_id, now])?;
        if let Some(row) = rows.next()? {
            Ok(Some(ShareRow {
                share_id: row.get(0)?,
                encrypted_payload: row.get(1)?,
                burn_token: row.get(2)?,
                expires_at: row.get(3)?,
                max_views: row.get(4)?,
                view_count: row.get(5)?,
            }))
        } else {
            Ok(None)
        }
    }

    pub async fn burn_share(&self, share_id: &str, burn_token: &str) -> Result<bool> {
        let conn = self.conn.lock().await;
        // Verify burn token matches before deleting
        let mut stmt = conn.prepare(
            "SELECT burn_token FROM shares WHERE share_id = ?1",
        )?;
        let mut rows = stmt.query(params![share_id])?;
        if let Some(row) = rows.next()? {
            let stored_token: String = row.get(0)?;
            if stored_token == burn_token {
                conn.execute("DELETE FROM shares WHERE share_id = ?1", params![share_id])?;
                return Ok(true);
            }
        }
        Ok(false)
    }
}
