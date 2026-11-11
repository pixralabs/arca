# Arca by Pixra (VaultGuard v0.5.0) — Zero-Knowledge Sync, Device Authorization & Security Review

## 1. Architectural Flaw Analysis & Implemented Zero-Knowledge Fixes

While reviewing the proposed New Device Authorization and Recovery Bypass flow against the core threat model (*"even if the server is fully compromised, user data remains mathematically inaccessible"*), three critical cryptographic flaws in a naive implementation were identified and remediated directly in `v0.5.0`:

| Vector ID | Flaw in Naive Plan | Zero-Knowledge Remediation Implemented in `v0.5.0` |
| :--- | :--- | :--- |
| **ZK-01: Recovery Bypass Spoofing (Step 6)** | If the client sends a boolean `{ "recoveryBypass": true }` or signs `/v1/device/request` using the `DEK`-derived `accountAuthPubKey`, anyone who only knows the Master Password (or compromises a single session's `DEK`) can forge a 24-Word Recovery Kit bypass and skip device approval. | **Independent Recovery Authority Keypair (`VG_RAU_1`, `RAU_ID = 6`)**: Derived directly from the 256-bit BIP39 Recovery Entropy (`mnemonicToEntropy(mnemonic)`), never from `DEK`. Because `DEK` is randomly generated and wrapped under `RecoveryKEK`, possessing the Master Password or `DEK` yields zero mathematical ability to derive `recoveryAuthPrivateKey`. The server verifies a detached Ed25519 signature over `"VG_DEVICE_RECOVERY_V1:"` against `recovery_auth_pub_key` before granting a recovery bypass. |
| **ZK-02: Revocation Evasion via Shared Account Key** | If all devices authenticate solely with the shared `accountAuthPubKey` and a self-reported `x-vg-device-id` header, a revoked device that cached the `DEK` can spoof an active device's `deviceId` or generate a fresh UUID. | **Per-Device Ed25519 Identity Key (`VG_DEV_1`, `DEV_ID = 7`) & Server-Enforced Trust State**: Each device derives a device-bound Ed25519 public key (`deviceAuthPubKey`) recorded in PostgreSQL (`devices` table: `TRUSTED`, `PENDING`, `REVOKED`). Every `/v1/sync/delta`, `/v1/sync/push`, and `/v1/device/*` call enforces `status == 'TRUSTED'` and purges active challenge nonces upon `POST /v1/device/revoke`. |
| **ZK-03: Blind Approval MITM Substitution** | If a compromised relay substitutes an attacker's `newDeviceId` during a `NEW_DEVICE_ATTEMPT` prompt, a user clicking "Yes, Allow" could inadvertently authorize an attacker's device. | **Short Authentication String (SAS) Verification Code (`compute_device_short_code`) & Signed Approval Certificates (`VG_DEVICE_APPROVE_V1:`)**: Both devices compute a deterministic 6-character SAS code (`XXX-XXX` via `SHA-256("VG_DEVICE_SAS_V1:" + accountId + ":" + deviceId + ":" + deviceAuthPubKey)`), and the approving device signs the target device's exact `deviceAuthPubKey`. |

## 2. Summary of Implemented Deliverables (`v0.5.0`)

### A. Rust Relay Server (`apps/relay-server`)
- **Database Migrations (`migrations/0001_initial.sql` & `migrations/0002_device_auth.sql`)**:
  - Added `recovery_auth_pub_key` to `accounts`.
  - Created `devices` table (`account_id`, `device_id`, `device_name`, `device_auth_pub_key`, `status`, `short_code`, `approved_by_device_id`, `approval_signature`, `last_seen_at`, `created_at`) with composite index `idx_devices_account_status`.
- **Device Authorization & Revocation Endpoints (`src/sync.rs`, `src/db.rs`, `src/auth.rs`)**:
  - `POST /v1/device/request`: Verifies single-use challenge and `VG_DEVICE_REQ_V1:` signature. Auto-approves if valid 24-Word Recovery signature (`VG_DEVICE_RECOVERY_V1:`) is attached or if no trusted devices exist yet; otherwise records `PENDING` and emits `{ "type": "NEW_DEVICE_ATTEMPT", "newDeviceId": "...", "shortCode": "..." }`.
  - `POST /v1/device/approve`: Verifies caller is an active `TRUSTED` device, verifies optional `VG_DEVICE_APPROVE_V1:` signature, and transitions target device to `TRUSTED` (or `REVOKED` if denied).
  - `GET /v1/device/list` & `POST /v1/device/list`: Returns all registered devices (`devices`) and pending `NEW_DEVICE_ATTEMPT` alerts (`pendingAttempts`).
  - `POST /v1/device/revoke`: Marks target device `REVOKED` and immediately deletes all unconsumed `auth_challenges` for that device.
- **One-Time Ephemeral Sharing (`src/share.rs`, `src/db.rs`)**:
  - Enforces a hard **5-minute (`300,000 ms`) TTL ceiling** (`DEFAULT_SHARE_TTL_MS = 300_000`, `MAX_SHARE_TTL_MS = 300_000`) and `max_views = 1`.
  - Atomically increments `view_count` and deletes (burns) the row on the first view (`get_and_burn_share_on_view`) OR after 5 minutes, whichever comes first, while keeping the decryption key strictly inside the client-side URL hash fragment (`#<shareId>:<shareKeyBase64>`).
- **Rate Limiting & Tamper-Proof Security Headers (`src/rate_limit.rs`, `src/main.rs`)**:
  - Scoped sliding-window IP rate limiting across `/v1/auth/*` (15 req/min), `/v1/device/*` (10 req/min), and `/v1/share/*` (5 req/min) using `ConnectInfo<SocketAddr>`.
  - Strict response header middleware injecting `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`, `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, and `Cache-Control: no-store, no-cache, must-revalidate`.

### B. Client Crypto, Extension & Mobile Updates (`packages/crypto`, `apps/extension`, `apps/mobile`)
- **`packages/crypto/src/syncAuth.ts` & `syncClient.ts`**:
  - Added `deriveRecoveryAuthKeyPair`, `deriveDeviceAuthKeyPair`, `computeDeviceShortCode`, `signDeviceAuthorizationRequest`, `signDeviceApprovalDecision`, `requestDeviceAuthorization`, `approveOrDenyDevice`, `listTrustedDevices`, and `revokeTrustedDevice`.
- **`apps/extension/src/popup/views/SettingsView.tsx` & `apps/mobile/src/screens/SettingsScreen.tsx`**:
  - Added **Opt-In Cloud Sync** toggle (default OFF / 100% Local in IndexedDB and SQLite).
  - Added **New Device Approval Alert Banner** (*"A new device is trying to access your vault. Allow?"* with Yes/Allow and No/Block actions).
  - Added **Active Devices List** with status badges, SAS codes, and one-click **Revoke** buttons.
  - Added **24-Word Recovery Kit Bypass** input for immediate cryptographic device authorization.

## 3. Recommended Zero-Knowledge Security Features for Future Phases (v0.6.0+)

1. **Post-Compromise DEK Rotation on Device Revocation (Lazy Re-Encryption + Epoch Ratchet)**:
   - *Why*: While server-side revocation (`POST /v1/device/revoke`) immediately blocks a revoked device from downloading future `/v1/sync/delta` updates, a revoked device whose local memory was dumped before revocation still knows the historical `DEK`.
   - *Design*: When a user clicks **Revoke** on a device, automatically trigger a **Vault Epoch Ratchet** (`keyVersion + 1`): generate a fresh 256-bit `DEK_{n+1}`, wrap `DEK_{n+1}` exclusively to the remaining `TRUSTED` devices' X25519 public keys (and re-wrap `VaultHeader` under `MasterKEK`), and re-seal modified items under `DEK_{n+1}`. Even if the revoked device colludes with a compromised relay server afterward, all new ciphertexts are mathematically indecipherable.
2. **Hardware Security Key (FIDO2 / WebAuthn `hmac-secret` & YubiKey) Multi-Factor Envelope Wrapping**:
   - *Why*: Protects against physical keyloggers capturing the Master Password on untrusted host OSes.
   - *Design*: Combine the Argon2id `MasterKEK` with the deterministic 32-byte output of a hardware FIDO2 security key (`YubiKey 5` / SoloKey via WebAuthn `prf` / CTAP2 `hmac-secret`) using HKDF-BLAKE2b (`MasterKEK_2FA = BLAKE2b(MasterKEK || FIDO2_PRF_Output)`). Neither the Master Password alone nor the physical hardware token alone can unwrap the `VaultHeader`.
3. **Duress / Plausible Deniability Vaults (Dual-Slot Hidden Envelope Architecture)**:
   - *Why*: Protects users under physical coercion (border crossings, extortion) where an adversary forces the user to type their Master Password.
   - *Design*: Pad every `VaultHeader` to a fixed `4096-byte` constant-size binary envelope containing **two indistinguishable Argon2id slots** (`Slot A: Primary Vault DEK` and `Slot B: Decoy/Duress Vault DEK`), both padded with random noise when unused. Entering the Duress Password unwraps `DEK_Decoy` and syncs/unlocks a believable decoy set of non-critical credentials, with zero forensic indicator that a primary vault exists.
4. **Transparency Log & Merkle Hash-Tree over Trusted Device Keys (Key Transparency)**:
   - *Why*: Prevents a compromised relay server from silently inserting a "ghost" `TRUSTED` device into the `devices` table without the user noticing.
   - *Design*: Embed the canonical list of `trustedDevicePubKeys` inside the BLAKE2b-signed `VaultManifest` (`manifest.trustedDeviceKeys`). Whenever any client pulls `/v1/sync/delta` or `/v1/device/list`, it verifies the server's returned device list against the `DEK`-signed `VaultManifest`. Any unauthorized device row injected into PostgreSQL by a compromised server triggers `ERR_MANIFEST_MAC_FAILED` and halts sync immediately.
