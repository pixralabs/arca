-- Migration: 0002_device_auth.sql
-- Idempotent upgrade for existing PostgreSQL / Supabase deployments adding Zero-Knowledge Device Authorization & Revocation

ALTER TABLE accounts ADD COLUMN IF NOT EXISTS recovery_auth_pub_key TEXT;

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

-- Backfill initial registering device for any pre-existing accounts as TRUSTED
INSERT INTO devices (account_id, device_id, device_name, device_auth_pub_key, status, short_code, last_seen_at, created_at)
SELECT
    account_id,
    device_id,
    'Primary Device',
    account_auth_pub_key,
    'TRUSTED',
    'PRIMARY',
    (EXTRACT(EPOCH FROM created_at) * 1000)::BIGINT,
    (EXTRACT(EPOCH FROM created_at) * 1000)::BIGINT
FROM accounts
ON CONFLICT (account_id, device_id) DO NOTHING;
