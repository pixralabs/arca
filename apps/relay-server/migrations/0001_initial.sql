-- Migration: 0001_initial.sql
-- Zero-Knowledge Blind Relay Server Initial Schema
-- Enforces PRAGMA secure_delete = ON at runtime

CREATE TABLE IF NOT EXISTS accounts (
    account_id TEXT PRIMARY KEY,
    device_id TEXT NOT NULL,
    account_auth_pub_key TEXT NOT NULL,
    encrypted_header TEXT NOT NULL,
    encrypted_manifest TEXT,
    vault_seq INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_items (
    account_id TEXT NOT NULL,
    item_id TEXT NOT NULL,
    revision INTEGER NOT NULL,
    nonce_base64 TEXT NOT NULL,
    ciphertext_base64 TEXT NOT NULL,
    hlc_timestamp TEXT NOT NULL,
    deleted_at INTEGER,
    updated_at INTEGER NOT NULL,
    vault_seq INTEGER NOT NULL,
    PRIMARY KEY (account_id, item_id),
    FOREIGN KEY (account_id) REFERENCES accounts(account_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sync_items_seq ON sync_items(account_id, vault_seq);

CREATE TABLE IF NOT EXISTS auth_challenges (
    challenge_nonce TEXT PRIMARY KEY,
    account_id TEXT NOT NULL,
    device_id TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    consumed INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_auth_challenges_acc ON auth_challenges(account_id, device_id);

CREATE TABLE IF NOT EXISTS shares (
    share_id TEXT PRIMARY KEY,
    encrypted_payload TEXT NOT NULL,
    burn_token TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    max_views INTEGER NOT NULL DEFAULT 1,
    view_count INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
);
