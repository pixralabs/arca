//! apps/relay-server/src/db.rs
//! PostgreSQL Database Layer using sqlx::PgPool (Supabase / any PostgreSQL backend).
//! Zero-Knowledge: The server only stores opaque ciphertext blobs — no plaintext ever touches here.

use sqlx::PgPool;

use crate::crdt::SyncItemRecord;

/// Thin wrapper around a `sqlx::PgPool` — cheaply cloneable.
#[derive(Clone)]
pub struct Db {
    pool: PgPool,
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
    /// Connect to PostgreSQL and run embedded migrations.
    pub async fn connect(database_url: &str) -> Result<Self, sqlx::Error> {
        tracing::info!("Connecting to PostgreSQL database…");

        let pool = sqlx::postgres::PgPoolOptions::new()
            .max_connections(10)
            .connect(database_url)
            .await?;

        tracing::info!("Running database migrations…");
        sqlx::migrate!("./migrations").run(&pool).await?;
        tracing::info!("Migrations applied successfully.");

        Ok(Self { pool })
    }

    // ── Accounts ────────────────────────────────────────────────────────────

    /// Upsert account registration. Returns the current `vault_seq`.
    pub async fn register_or_update_account(
        &self,
        account_id: &str,
        device_id: &str,
        account_auth_pub_key: &str,
        encrypted_header: &str,
    ) -> Result<u64, sqlx::Error> {
        // Try to read existing seq first
        let existing: Option<i64> = sqlx::query_scalar(
            "SELECT vault_seq FROM accounts WHERE account_id = $1",
        )
        .bind(account_id)
        .fetch_optional(&self.pool)
        .await?;

        match existing {
            Some(seq) => {
                sqlx::query(
                    r#"
                    UPDATE accounts
                    SET device_id = $1,
                        account_auth_pub_key = $2,
                        encrypted_header = $3,
                        updated_at = NOW()
                    WHERE account_id = $4
                    "#,
                )
                .bind(device_id)
                .bind(account_auth_pub_key)
                .bind(encrypted_header)
                .bind(account_id)
                .execute(&self.pool)
                .await?;
                Ok(seq as u64)
            }
            None => {
                sqlx::query(
                    r#"
                    INSERT INTO accounts
                        (account_id, device_id, account_auth_pub_key, encrypted_header, encrypted_manifest, vault_seq, created_at, updated_at)
                    VALUES ($1, $2, $3, $4, NULL, 1, NOW(), NOW())
                    "#,
                )
                .bind(account_id)
                .bind(device_id)
                .bind(account_auth_pub_key)
                .bind(encrypted_header)
                .execute(&self.pool)
                .await?;
                Ok(1)
            }
        }
    }

    pub async fn get_account(&self, account_id: &str) -> Result<Option<AccountRow>, sqlx::Error> {
        let row: Option<(String, String, String, String, Option<String>, i64)> = sqlx::query_as(
            r#"
            SELECT account_id, device_id, account_auth_pub_key, encrypted_header, encrypted_manifest, vault_seq
            FROM accounts
            WHERE account_id = $1
            "#,
        )
        .bind(account_id)
        .fetch_optional(&self.pool)
        .await?;

        Ok(row.map(|(account_id, device_id, account_auth_pub_key, encrypted_header, encrypted_manifest, vault_seq)| {
            AccountRow {
                account_id,
                device_id,
                account_auth_pub_key,
                encrypted_header,
                encrypted_manifest,
                vault_seq: vault_seq as u64,
            }
        }))
    }

    /// Permanently delete an account and all its data.
    /// Called only by DELETE /v1/account (explicit user action).
    pub async fn delete_account(&self, account_id: &str) -> Result<(), sqlx::Error> {
        // Cascade is defined at the DB level; delete items + challenges explicitly for safety.
        sqlx::query("DELETE FROM sync_items WHERE account_id = $1")
            .bind(account_id)
            .execute(&self.pool)
            .await?;
        sqlx::query("DELETE FROM auth_challenges WHERE account_id = $1")
            .bind(account_id)
            .execute(&self.pool)
            .await?;
        sqlx::query("DELETE FROM accounts WHERE account_id = $1")
            .bind(account_id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    // ── Auth Challenges ──────────────────────────────────────────────────────

    pub async fn save_challenge(
        &self,
        challenge_nonce: &str,
        account_id: &str,
        device_id: &str,
        expires_at: i64,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"
            INSERT INTO auth_challenges (challenge_nonce, account_id, device_id, expires_at, consumed)
            VALUES ($1, $2, $3, $4, 0)
            "#,
        )
        .bind(challenge_nonce)
        .bind(account_id)
        .bind(device_id)
        .bind(expires_at)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    /// Atomically consume a single-use challenge nonce. Returns `true` if successfully consumed.
    pub async fn consume_challenge(
        &self,
        challenge_nonce: &str,
        account_id: &str,
        device_id: &str,
    ) -> Result<bool, sqlx::Error> {
        let now = chrono::Utc::now().timestamp_millis();

        let result = sqlx::query(
            r#"
            UPDATE auth_challenges
            SET consumed = 1
            WHERE challenge_nonce = $1
              AND account_id      = $2
              AND device_id       = $3
              AND consumed        = 0
              AND expires_at      > $4
            "#,
        )
        .bind(challenge_nonce)
        .bind(account_id)
        .bind(device_id)
        .bind(now)
        .execute(&self.pool)
        .await?;

        Ok(result.rows_affected() > 0)
    }

    // ── Sync Items ───────────────────────────────────────────────────────────

    pub async fn get_sync_items_since(
        &self,
        account_id: &str,
        since_seq: u64,
    ) -> Result<Vec<SyncItemRecord>, sqlx::Error> {
        let rows: Vec<(String, i64, String, String, String, Option<i64>, i64)> = sqlx::query_as(
            r#"
            SELECT item_id, revision, nonce_base64, ciphertext_base64, hlc_timestamp, deleted_at, updated_at
            FROM sync_items
            WHERE account_id = $1 AND vault_seq > $2
            ORDER BY vault_seq ASC
            "#,
        )
        .bind(account_id)
        .bind(since_seq as i64)
        .fetch_all(&self.pool)
        .await?;

        Ok(rows
            .into_iter()
            .map(|(item_id, revision, nonce_base64, ciphertext_base64, hlc_timestamp, deleted_at, updated_at)| {
                SyncItemRecord { item_id, revision, nonce_base64, ciphertext_base64, hlc_timestamp, deleted_at, updated_at }
            })
            .collect())
    }

    pub async fn get_existing_item(
        &self,
        account_id: &str,
        item_id: &str,
    ) -> Result<Option<SyncItemRecord>, sqlx::Error> {
        let row: Option<(String, i64, String, String, String, Option<i64>, i64)> = sqlx::query_as(
            r#"
            SELECT item_id, revision, nonce_base64, ciphertext_base64, hlc_timestamp, deleted_at, updated_at
            FROM sync_items
            WHERE account_id = $1 AND item_id = $2
            "#,
        )
        .bind(account_id)
        .bind(item_id)
        .fetch_optional(&self.pool)
        .await?;

        Ok(row.map(|(item_id, revision, nonce_base64, ciphertext_base64, hlc_timestamp, deleted_at, updated_at)| {
            SyncItemRecord { item_id, revision, nonce_base64, ciphertext_base64, hlc_timestamp, deleted_at, updated_at }
        }))
    }

    pub async fn upsert_sync_item(
        &self,
        account_id: &str,
        item: &SyncItemRecord,
        new_vault_seq: u64,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"
            INSERT INTO sync_items
                (account_id, item_id, revision, nonce_base64, ciphertext_base64, hlc_timestamp, deleted_at, updated_at, vault_seq)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            ON CONFLICT (account_id, item_id) DO UPDATE SET
                revision          = EXCLUDED.revision,
                nonce_base64      = EXCLUDED.nonce_base64,
                ciphertext_base64 = EXCLUDED.ciphertext_base64,
                hlc_timestamp     = EXCLUDED.hlc_timestamp,
                deleted_at        = EXCLUDED.deleted_at,
                updated_at        = EXCLUDED.updated_at,
                vault_seq         = EXCLUDED.vault_seq
            "#,
        )
        .bind(account_id)
        .bind(&item.item_id)
        .bind(item.revision)
        .bind(&item.nonce_base64)
        .bind(&item.ciphertext_base64)
        .bind(&item.hlc_timestamp)
        .bind(item.deleted_at)
        .bind(item.updated_at)
        .bind(new_vault_seq as i64)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn update_account_vault_seq_and_manifest(
        &self,
        account_id: &str,
        new_vault_seq: u64,
        manifest: Option<&str>,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"
            UPDATE accounts
            SET vault_seq          = $1,
                encrypted_manifest = COALESCE($2, encrypted_manifest),
                updated_at         = NOW()
            WHERE account_id = $3
            "#,
        )
        .bind(new_vault_seq as i64)
        .bind(manifest)
        .bind(account_id)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    // ── Ephemeral Shares ─────────────────────────────────────────────────────

    pub async fn create_share(
        &self,
        share_id: &str,
        encrypted_payload: &str,
        burn_token: &str,
        expires_at: i64,
        max_views: i32,
    ) -> Result<(), sqlx::Error> {
        let now = chrono::Utc::now().timestamp_millis();
        sqlx::query(
            r#"
            INSERT INTO shares (share_id, encrypted_payload, burn_token, expires_at, max_views, view_count, created_at)
            VALUES ($1, $2, $3, $4, $5, 0, $6)
            "#,
        )
        .bind(share_id)
        .bind(encrypted_payload)
        .bind(burn_token)
        .bind(expires_at)
        .bind(max_views)
        .bind(now)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn get_share(&self, share_id: &str) -> Result<Option<ShareRow>, sqlx::Error> {
        let now = chrono::Utc::now().timestamp_millis();
        let row: Option<(String, String, String, i64, i32, i32)> = sqlx::query_as(
            r#"
            SELECT share_id, encrypted_payload, burn_token, expires_at, max_views, view_count
            FROM shares
            WHERE share_id = $1 AND expires_at > $2 AND view_count < max_views
            "#,
        )
        .bind(share_id)
        .bind(now)
        .fetch_optional(&self.pool)
        .await?;

        Ok(row.map(|(share_id, encrypted_payload, burn_token, expires_at, max_views, view_count)| {
            ShareRow { share_id, encrypted_payload, burn_token, expires_at, max_views, view_count }
        }))
    }

    pub async fn burn_share(&self, share_id: &str, burn_token: &str) -> Result<bool, sqlx::Error> {
        // Verify burn_token first, then delete atomically
        let stored: Option<String> = sqlx::query_scalar(
            "SELECT burn_token FROM shares WHERE share_id = $1",
        )
        .bind(share_id)
        .fetch_optional(&self.pool)
        .await?;

        match stored {
            Some(t) if t == burn_token => {
                sqlx::query("DELETE FROM shares WHERE share_id = $1")
                    .bind(share_id)
                    .execute(&self.pool)
                    .await?;
                Ok(true)
            }
            _ => Ok(false),
        }
    }
}
