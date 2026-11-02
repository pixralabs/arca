//! apps/relay-server/src/db.rs
//! PostgreSQL Database Layer using sqlx::PgPool (Supabase / any PostgreSQL backend).
//! Zero-Knowledge: The server only stores opaque ciphertext blobs and Ed25519 public keys — no plaintext ever touches here.

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
    pub recovery_auth_pub_key: Option<String>,
    pub encrypted_header: String,
    pub encrypted_manifest: Option<String>,
    pub vault_seq: u64,
}

#[derive(Debug, Clone)]
pub struct DeviceRow {
    pub account_id: String,
    pub device_id: String,
    pub device_name: String,
    pub device_auth_pub_key: String,
    pub status: String, // "TRUSTED" | "PENDING" | "REVOKED"
    pub short_code: String,
    pub approved_by_device_id: Option<String>,
    pub approval_signature: Option<String>,
    pub last_seen_at: i64,
    pub created_at: i64,
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

    /// Upsert account registration and register the initial device as TRUSTED if no trusted device exists yet.
    pub async fn register_or_update_account(
        &self,
        account_id: &str,
        device_id: &str,
        device_name: Option<&str>,
        account_auth_pub_key: &str,
        recovery_auth_pub_key: Option<&str>,
        device_auth_pub_key: Option<&str>,
        short_code: &str,
        encrypted_header: &str,
    ) -> Result<u64, sqlx::Error> {
        let existing: Option<i64> = sqlx::query_scalar(
            "SELECT vault_seq FROM accounts WHERE account_id = $1",
        )
        .bind(account_id)
        .fetch_optional(&self.pool)
        .await?;

        let vault_seq = match existing {
            Some(seq) => {
                sqlx::query(
                    r#"
                    UPDATE accounts
                    SET device_id             = $1,
                        account_auth_pub_key  = $2,
                        recovery_auth_pub_key = COALESCE($3, recovery_auth_pub_key),
                        encrypted_header      = $4,
                        updated_at            = NOW()
                    WHERE account_id = $5
                    "#,
                )
                .bind(device_id)
                .bind(account_auth_pub_key)
                .bind(recovery_auth_pub_key)
                .bind(encrypted_header)
                .bind(account_id)
                .execute(&self.pool)
                .await?;
                seq as u64
            }
            None => {
                sqlx::query(
                    r#"
                    INSERT INTO accounts
                        (account_id, device_id, account_auth_pub_key, recovery_auth_pub_key, encrypted_header, encrypted_manifest, vault_seq, created_at, updated_at)
                    VALUES ($1, $2, $3, $4, $5, NULL, 1, NOW(), NOW())
                    "#,
                )
                .bind(account_id)
                .bind(device_id)
                .bind(account_auth_pub_key)
                .bind(recovery_auth_pub_key)
                .bind(encrypted_header)
                .execute(&self.pool)
                .await?;
                1
            }
        };

        // Ensure the initial registering device is recorded as TRUSTED if no trusted devices exist yet
        let trusted_count = self.count_trusted_devices(account_id).await?;
        if trusted_count == 0 {
            let now = chrono::Utc::now().timestamp_millis();
            let resolved_device_pub_key = device_auth_pub_key.unwrap_or(account_auth_pub_key);
            let resolved_name = device_name.unwrap_or("Primary Device");
            let initial_device = DeviceRow {
                account_id: account_id.to_string(),
                device_id: device_id.to_string(),
                device_name: resolved_name.to_string(),
                device_auth_pub_key: resolved_device_pub_key.to_string(),
                status: "TRUSTED".to_string(),
                short_code: short_code.to_string(),
                approved_by_device_id: Some(device_id.to_string()),
                approval_signature: None,
                last_seen_at: now,
                created_at: now,
            };
            self.upsert_device(&initial_device).await?;
        }

        Ok(vault_seq)
    }

    pub async fn get_account(&self, account_id: &str) -> Result<Option<AccountRow>, sqlx::Error> {
        let row: Option<(String, String, String, Option<String>, String, Option<String>, i64)> =
            sqlx::query_as(
                r#"
                SELECT account_id, device_id, account_auth_pub_key, recovery_auth_pub_key, encrypted_header, encrypted_manifest, vault_seq
                FROM accounts
                WHERE account_id = $1
                "#,
            )
            .bind(account_id)
            .fetch_optional(&self.pool)
            .await?;

        Ok(row.map(
            |(
                account_id,
                device_id,
                account_auth_pub_key,
                recovery_auth_pub_key,
                encrypted_header,
                encrypted_manifest,
                vault_seq,
            )| {
                AccountRow {
                    account_id,
                    device_id,
                    account_auth_pub_key,
                    recovery_auth_pub_key,
                    encrypted_header,
                    encrypted_manifest,
                    vault_seq: vault_seq as u64,
                }
            },
        ))
    }

    pub async fn set_recovery_auth_pub_key_if_unset(
        &self,
        account_id: &str,
        recovery_auth_pub_key: &str,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"
            UPDATE accounts
            SET recovery_auth_pub_key = COALESCE(recovery_auth_pub_key, $1),
                updated_at = NOW()
            WHERE account_id = $2
            "#,
        )
        .bind(recovery_auth_pub_key)
        .bind(account_id)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    /// Permanently delete an account and all its data.
    /// Called only by DELETE /v1/account (explicit user action).
    pub async fn delete_account(&self, account_id: &str) -> Result<(), sqlx::Error> {
        sqlx::query("DELETE FROM devices WHERE account_id = $1")
            .bind(account_id)
            .execute(&self.pool)
            .await?;
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

    // ── Devices (Zero-Knowledge Device Authorization & Revocation) ───────────

    pub async fn count_trusted_devices(&self, account_id: &str) -> Result<i64, sqlx::Error> {
        let count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM devices WHERE account_id = $1 AND status = 'TRUSTED'",
        )
        .bind(account_id)
        .fetch_one(&self.pool)
        .await?;
        Ok(count)
    }

    pub async fn get_device(
        &self,
        account_id: &str,
        device_id: &str,
    ) -> Result<Option<DeviceRow>, sqlx::Error> {
        let row: Option<(
            String,
            String,
            String,
            String,
            String,
            String,
            Option<String>,
            Option<String>,
            i64,
            i64,
        )> = sqlx::query_as(
            r#"
            SELECT account_id, device_id, device_name, device_auth_pub_key, status, short_code,
                   approved_by_device_id, approval_signature, last_seen_at, created_at
            FROM devices
            WHERE account_id = $1 AND device_id = $2
            "#,
        )
        .bind(account_id)
        .bind(device_id)
        .fetch_optional(&self.pool)
        .await?;

        Ok(row.map(
            |(
                account_id,
                device_id,
                device_name,
                device_auth_pub_key,
                status,
                short_code,
                approved_by_device_id,
                approval_signature,
                last_seen_at,
                created_at,
            )| DeviceRow {
                account_id,
                device_id,
                device_name,
                device_auth_pub_key,
                status,
                short_code,
                approved_by_device_id,
                approval_signature,
                last_seen_at,
                created_at,
            },
        ))
    }

    pub async fn list_devices(&self, account_id: &str) -> Result<Vec<DeviceRow>, sqlx::Error> {
        let rows: Vec<(
            String,
            String,
            String,
            String,
            String,
            String,
            Option<String>,
            Option<String>,
            i64,
            i64,
        )> = sqlx::query_as(
            r#"
            SELECT account_id, device_id, device_name, device_auth_pub_key, status, short_code,
                   approved_by_device_id, approval_signature, last_seen_at, created_at
            FROM devices
            WHERE account_id = $1
            ORDER BY created_at ASC
            "#,
        )
        .bind(account_id)
        .fetch_all(&self.pool)
        .await?;

        Ok(rows
            .into_iter()
            .map(
                |(
                    account_id,
                    device_id,
                    device_name,
                    device_auth_pub_key,
                    status,
                    short_code,
                    approved_by_device_id,
                    approval_signature,
                    last_seen_at,
                    created_at,
                )| DeviceRow {
                    account_id,
                    device_id,
                    device_name,
                    device_auth_pub_key,
                    status,
                    short_code,
                    approved_by_device_id,
                    approval_signature,
                    last_seen_at,
                    created_at,
                },
            )
            .collect())
    }

    pub async fn upsert_device(&self, row: &DeviceRow) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"
            INSERT INTO devices
                (account_id, device_id, device_name, device_auth_pub_key, status, short_code,
                 approved_by_device_id, approval_signature, last_seen_at, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            ON CONFLICT (account_id, device_id) DO UPDATE SET
                device_name           = EXCLUDED.device_name,
                device_auth_pub_key   = EXCLUDED.device_auth_pub_key,
                status                = EXCLUDED.status,
                short_code            = EXCLUDED.short_code,
                approved_by_device_id = COALESCE(EXCLUDED.approved_by_device_id, devices.approved_by_device_id),
                approval_signature    = COALESCE(EXCLUDED.approval_signature, devices.approval_signature),
                last_seen_at          = EXCLUDED.last_seen_at
            "#,
        )
        .bind(&row.account_id)
        .bind(&row.device_id)
        .bind(&row.device_name)
        .bind(&row.device_auth_pub_key)
        .bind(&row.status)
        .bind(&row.short_code)
        .bind(&row.approved_by_device_id)
        .bind(&row.approval_signature)
        .bind(row.last_seen_at)
        .bind(row.created_at)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn approve_or_deny_device(
        &self,
        account_id: &str,
        target_device_id: &str,
        approve: bool,
        approver_device_id: &str,
        approval_signature: Option<&str>,
    ) -> Result<bool, sqlx::Error> {
        let next_status = if approve { "TRUSTED" } else { "REVOKED" };
        let now = chrono::Utc::now().timestamp_millis();
        let result = sqlx::query(
            r#"
            UPDATE devices
            SET status                = $1,
                approved_by_device_id = $2,
                approval_signature    = $3,
                last_seen_at          = $4
            WHERE account_id = $5 AND device_id = $6
            "#,
        )
        .bind(next_status)
        .bind(approver_device_id)
        .bind(approval_signature)
        .bind(now)
        .bind(account_id)
        .bind(target_device_id)
        .execute(&self.pool)
        .await?;

        if !approve {
            sqlx::query("DELETE FROM auth_challenges WHERE account_id = $1 AND device_id = $2")
                .bind(account_id)
                .bind(target_device_id)
                .execute(&self.pool)
                .await?;
        }

        Ok(result.rows_affected() > 0)
    }

    pub async fn revoke_device(
        &self,
        account_id: &str,
        target_device_id: &str,
    ) -> Result<bool, sqlx::Error> {
        let now = chrono::Utc::now().timestamp_millis();
        let result = sqlx::query(
            r#"
            UPDATE devices
            SET status       = 'REVOKED',
                last_seen_at = $1
            WHERE account_id = $2 AND device_id = $3
            "#,
        )
        .bind(now)
        .bind(account_id)
        .bind(target_device_id)
        .execute(&self.pool)
        .await?;

        // Immediately purge any pending challenge nonces for the revoked device
        sqlx::query("DELETE FROM auth_challenges WHERE account_id = $1 AND device_id = $2")
            .bind(account_id)
            .bind(target_device_id)
            .execute(&self.pool)
            .await?;

        Ok(result.rows_affected() > 0)
    }

    pub async fn touch_device_last_seen(
        &self,
        account_id: &str,
        device_id: &str,
    ) -> Result<(), sqlx::Error> {
        let now = chrono::Utc::now().timestamp_millis();
        sqlx::query(
            "UPDATE devices SET last_seen_at = $1 WHERE account_id = $2 AND device_id = $3",
        )
        .bind(now)
        .bind(account_id)
        .bind(device_id)
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
            .map(
                |(
                    item_id,
                    revision,
                    nonce_base64,
                    ciphertext_base64,
                    hlc_timestamp,
                    deleted_at,
                    updated_at,
                )| {
                    SyncItemRecord {
                        item_id,
                        revision,
                        nonce_base64,
                        ciphertext_base64,
                        hlc_timestamp,
                        deleted_at,
                        updated_at,
                    }
                },
            )
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

        Ok(row.map(
            |(
                item_id,
                revision,
                nonce_base64,
                ciphertext_base64,
                hlc_timestamp,
                deleted_at,
                updated_at,
            )| {
                SyncItemRecord {
                    item_id,
                    revision,
                    nonce_base64,
                    ciphertext_base64,
                    hlc_timestamp,
                    deleted_at,
                    updated_at,
                }
            },
        ))
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

    // ── Ephemeral Shares (5-Minute Max TTL + Burn on First View) ─────────────

    pub async fn create_share(
        &self,
        share_id: &str,
        encrypted_payload: &str,
        burn_token: &str,
        expires_at: i64,
        max_views: i32,
    ) -> Result<(), sqlx::Error> {
        let now = chrono::Utc::now().timestamp_millis();
        // Opportunistically purge expired shares older than now
        let _ = sqlx::query("DELETE FROM shares WHERE expires_at <= $1")
            .bind(now)
            .execute(&self.pool)
            .await;

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

    /// Retrieves a share if it has not expired (5-minute window) and has not reached `max_views`.
    /// When `consume_view == true`, atomically increments `view_count` and burns (deletes) the row
    /// immediately once `view_count >= max_views`.
    pub async fn get_and_burn_share_on_view(
        &self,
        share_id: &str,
        consume_view: bool,
    ) -> Result<Option<ShareRow>, sqlx::Error> {
        let now = chrono::Utc::now().timestamp_millis();

        // Purge any expired share rows first (strict 5-minute expiration)
        sqlx::query("DELETE FROM shares WHERE expires_at <= $1")
            .bind(now)
            .execute(&self.pool)
            .await?;

        if consume_view {
            // Atomically delete (burn) on first view when max_views <= 1, or increment view_count
            let row: Option<(String, String, String, i64, i32, i32)> = sqlx::query_as(
                r#"
                UPDATE shares
                SET view_count = view_count + 1
                WHERE share_id = $1 AND expires_at > $2 AND view_count < max_views
                RETURNING share_id, encrypted_payload, burn_token, expires_at, max_views, view_count
                "#,
            )
            .bind(share_id)
            .bind(now)
            .fetch_optional(&self.pool)
            .await?;

            if let Some((ref id, _, _, _, max_v, cur_v)) = row {
                if cur_v >= max_v {
                    sqlx::query("DELETE FROM shares WHERE share_id = $1")
                        .bind(id)
                        .execute(&self.pool)
                        .await?;
                }
            }

            Ok(row.map(
                |(share_id, encrypted_payload, burn_token, expires_at, max_views, view_count)| {
                    ShareRow {
                        share_id,
                        encrypted_payload,
                        burn_token,
                        expires_at,
                        max_views,
                        view_count,
                    }
                },
            ))
        } else {
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

            Ok(row.map(
                |(share_id, encrypted_payload, burn_token, expires_at, max_views, view_count)| {
                    ShareRow {
                        share_id,
                        encrypted_payload,
                        burn_token,
                        expires_at,
                        max_views,
                        view_count,
                    }
                },
            ))
        }
    }

    pub async fn burn_share(&self, share_id: &str, burn_token: &str) -> Result<bool, sqlx::Error> {
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
            Some(_) => Ok(false),
            // Already burned on atomic first view
            None => Ok(!burn_token.trim().is_empty()),
        }
    }
}
