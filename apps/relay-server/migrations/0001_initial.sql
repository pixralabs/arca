-- Migration: 0001_initial.sql
-- Zero-Knowledge Blind Relay Server Schema (PostgreSQL / Supabase)
-- Includes Accounts, Devices (Trusted/Pending/Revoked), Device Approval Events, Sync Items, Auth Challenges & 5-Min Ephemeral Shares

CREATE TABLE IF NOT EXISTS accounts (
    account_id             TEXT        PRIMARY KEY,
    device_id              TEXT        NOT NULL,
    account_auth_pub_key   TEXT        NOT NULL,
    recovery_auth_pub_key  TEXT,
    encrypted_header       TEXT        NOT NULL,
    encrypted_manifest     TEXT,
    vault_seq              BIGINT      NOT NULL DEFAULT 1,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS devices (
    account_id             TEXT        NOT NULL,
    device_id              TEXT        NOT NULL,
    device_name            TEXT        NOT NULL DEFAULT 'Arca Client',
    device_auth_pub_key    TEXT        NOT NULL,
    status                 TEXT        NOT NULL DEFAULT 'PENDING', -- 'TRUSTED' | 'PENDING' | 'REVOKED'
    short_code             TEXT        NOT NULL DEFAULT '',
    approved_by_device_id  TEXT,
    approval_signature     TEXT,
    last_seen_at           BIGINT      NOT NULL,
    created_at             BIGINT      NOT NULL,
    PRIMARY KEY (account_id, device_id),
    FOREIGN KEY (account_id) REFERENCES accounts(account_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_devices_account_status ON devices(account_id, status);

CREATE TABLE IF NOT EXISTS sync_items (
    account_id         TEXT   NOT NULL,
    item_id            TEXT   NOT NULL,
    revision           BIGINT NOT NULL,
    nonce_base64       TEXT   NOT NULL,
    ciphertext_base64  TEXT   NOT NULL,
    hlc_timestamp      TEXT   NOT NULL,
    deleted_at         BIGINT,
    updated_at         BIGINT NOT NULL,
    vault_seq          BIGINT NOT NULL,
    PRIMARY KEY (account_id, item_id),
    FOREIGN KEY (account_id) REFERENCES accounts(account_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sync_items_seq ON sync_items(account_id, vault_seq);

CREATE TABLE IF NOT EXISTS auth_challenges (
    challenge_nonce TEXT    PRIMARY KEY,
    account_id      TEXT    NOT NULL,
    device_id       TEXT    NOT NULL,
    expires_at      BIGINT  NOT NULL,
    consumed        INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_auth_challenges_acc ON auth_challenges(account_id, device_id);

-- Ephemeral shares table (5-minute max TTL + atomic burn on first view)
CREATE TABLE IF NOT EXISTS shares (
    share_id          TEXT    PRIMARY KEY,
    encrypted_payload TEXT    NOT NULL,
    burn_token        TEXT    NOT NULL,
    expires_at        BIGINT  NOT NULL,
    max_views         INTEGER NOT NULL DEFAULT 1,
    view_count        INTEGER NOT NULL DEFAULT 0,
    created_at        BIGINT  NOT NULL
);
