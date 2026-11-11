//! apps/relay-server/src/sync.rs
//! Zero-Knowledge Blind Relay Sync & Device Authorization API
//! (Ed25519 Challenge-Response, HLC CRDT, CAS, New Device OTP/Approval, 24-Word Recovery Bypass & Instant Revocation).

use axum::{
    body::Bytes,
    extract::{ConnectInfo, Query, State},
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
    Json,
};
use serde::{Deserialize, Serialize};
use std::net::SocketAddr;
use std::sync::Arc;

use crate::{
    auth::{
        build_auth_preimage, build_device_approval_preimage, build_device_recovery_preimage,
        build_device_request_preimage, build_register_preimage, compute_device_short_code,
        compute_sha256_hex, generate_challenge_nonce, verify_signature,
    },
    crdt::{should_incoming_sync_item_win, SyncItemRecord},
    db::{AccountRow, Db, DeviceRow},
    rate_limit::{
        RateLimiter, AUTH_RATE_LIMIT_PER_MIN, DEVICE_RATE_LIMIT_PER_MIN, RATE_LIMIT_WINDOW_MS,
    },
};

pub const CHALLENGE_TTL_MS: i64 = 300_000; // 5 minutes
pub const MAX_TIMESTAMP_SKEW_MS: i64 = 300_000; // 5 minutes

#[derive(Clone)]
pub struct AppState {
    pub db: Db,
    pub rate_limiter: RateLimiter,
    pub trusted_proxy: bool,
}

// --- DTOs ---

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegisterRequest {
    pub account_id: String,
    pub device_id: String,
    pub device_name: Option<String>,
    pub account_auth_pub_key: String,
    pub recovery_auth_pub_key: Option<String>,
    pub device_auth_pub_key: Option<String>,
    pub encrypted_header: String,
    pub registration_signature: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RegisterResponse {
    pub ok: bool,
    pub account_id: String,
    pub vault_seq: u64,
    pub device_status: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChallengeRequest {
    pub account_id: String,
    pub device_id: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChallengeResponse {
    pub challenge_nonce: String,
    pub expires_at: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VerifyRequest {
    pub account_id: String,
    pub device_id: String,
    pub challenge_nonce: String,
    pub timestamp: i64,
    pub body_sha256: String,
    pub signature: String,
}

#[derive(Debug, Deserialize)]
pub struct DeltaQuery {
    #[serde(rename = "sinceSeq", default)]
    pub since_seq: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeltaResponse {
    pub current_vault_seq: u64,
    pub encrypted_header: String,
    pub encrypted_manifest: Option<String>,
    pub items: Vec<SyncItemDto>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncItemDto {
    pub item_id: String,
    pub revision: i64,
    pub nonce_base64: String,
    pub ciphertext_base64: String,
    pub hlc_timestamp: String,
    pub deleted_at: Option<i64>,
    pub updated_at: i64,
}

impl From<SyncItemRecord> for SyncItemDto {
    fn from(r: SyncItemRecord) -> Self {
        Self {
            item_id: r.item_id,
            revision: r.revision,
            nonce_base64: r.nonce_base64,
            ciphertext_base64: r.ciphertext_base64,
            hlc_timestamp: r.hlc_timestamp,
            deleted_at: r.deleted_at,
            updated_at: r.updated_at,
        }
    }
}

impl From<SyncItemDto> for SyncItemRecord {
    fn from(d: SyncItemDto) -> Self {
        Self {
            item_id: d.item_id,
            revision: d.revision,
            nonce_base64: d.nonce_base64,
            ciphertext_base64: d.ciphertext_base64,
            hlc_timestamp: d.hlc_timestamp,
            deleted_at: d.deleted_at,
            updated_at: d.updated_at,
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PushRequest {
    pub expected_vault_seq: u64,
    pub encrypted_manifest: Option<String>,
    pub items: Vec<SyncItemDto>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PushSuccessResponse {
    pub ok: bool,
    pub new_vault_seq: u64,
    pub applied_count: usize,
    pub skipped_stale_count: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PushConflictResponse {
    pub ok: bool,
    pub error: String,
    pub current_vault_seq: u64,
}

// --- Device Authorization DTOs ---

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceAuthRequestPayload {
    pub account_id: String,
    pub device_id: String,
    pub device_name: Option<String>,
    pub device_auth_pub_key: String,
    pub challenge_nonce: String,
    pub timestamp: i64,
    pub signature: String,
    pub recovery_auth_pub_key: Option<String>,
    pub recovery_signature: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewDeviceAttemptEvent {
    #[serde(rename = "type")]
    pub event_type: String, // "NEW_DEVICE_ATTEMPT"
    pub new_device_id: String,
    pub device_name: String,
    pub device_auth_pub_key: String,
    pub short_code: String,
    pub requested_at: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceAuthRequestResponse {
    pub ok: bool,
    pub status: String, // "TRUSTED" | "PENDING" | "REVOKED"
    pub bypass_used: bool,
    pub device_id: String,
    pub short_code: String,
    pub encrypted_header: Option<String>,
    pub encrypted_manifest: Option<String>,
    pub vault_seq: Option<u64>,
    pub event: Option<NewDeviceAttemptEvent>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceApproveRequest {
    pub target_device_id: String,
    pub approve: bool,
    pub approval_signature: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceApproveResponse {
    pub ok: bool,
    pub target_device_id: String,
    pub status: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceRevokeRequest {
    pub target_device_id: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceRevokeResponse {
    pub ok: bool,
    pub revoked_device_id: String,
    pub status: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceDto {
    pub device_id: String,
    pub device_name: String,
    pub device_auth_pub_key: String,
    pub status: String,
    pub short_code: String,
    pub approved_by_device_id: Option<String>,
    pub last_seen_at: i64,
    pub created_at: i64,
}

impl From<DeviceRow> for DeviceDto {
    fn from(r: DeviceRow) -> Self {
        Self {
            device_id: r.device_id,
            device_name: r.device_name,
            device_auth_pub_key: r.device_auth_pub_key,
            status: r.status,
            short_code: r.short_code,
            approved_by_device_id: r.approved_by_device_id,
            last_seen_at: r.last_seen_at,
            created_at: r.created_at,
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceListResponse {
    pub ok: bool,
    pub devices: Vec<DeviceDto>,
    pub pending_attempts: Vec<NewDeviceAttemptEvent>,
}

#[derive(Debug, Serialize)]
pub struct GenericOkResponse {
    pub ok: bool,
}

#[derive(Debug, Serialize)]
pub struct ErrorMessage {
    pub error: String,
}

// --- Auth Extraction, Signature Verification & Trusted Device Enforcement ---

async fn authenticate_request(
    db: &Db,
    headers: &HeaderMap,
    body_bytes: &[u8],
) -> Result<(AccountRow, String), (StatusCode, Json<ErrorMessage>)> {
    let account_id = headers
        .get("x-vg-account-id")
        .and_then(|v| v.to_str().ok())
        .ok_or_else(|| {
            (
                StatusCode::UNAUTHORIZED,
                Json(ErrorMessage {
                    error: "ERR_SYNC_AUTH_MISSING_ACCOUNT_ID".into(),
                }),
            )
        })?;

    let device_id = headers
        .get("x-vg-device-id")
        .and_then(|v| v.to_str().ok())
        .ok_or_else(|| {
            (
                StatusCode::UNAUTHORIZED,
                Json(ErrorMessage {
                    error: "ERR_SYNC_AUTH_MISSING_DEVICE_ID".into(),
                }),
            )
        })?;

    let challenge_nonce = headers
        .get("x-vg-challenge-nonce")
        .and_then(|v| v.to_str().ok())
        .ok_or_else(|| {
            (
                StatusCode::UNAUTHORIZED,
                Json(ErrorMessage {
                    error: "ERR_SYNC_AUTH_MISSING_CHALLENGE_NONCE".into(),
                }),
            )
        })?;

    let timestamp_str = headers
        .get("x-vg-timestamp")
        .and_then(|v| v.to_str().ok())
        .ok_or_else(|| {
            (
                StatusCode::UNAUTHORIZED,
                Json(ErrorMessage {
                    error: "ERR_SYNC_AUTH_MISSING_TIMESTAMP".into(),
                }),
            )
        })?;

    let timestamp: i64 = timestamp_str.parse().map_err(|_| {
        (
            StatusCode::UNAUTHORIZED,
            Json(ErrorMessage {
                error: "ERR_SYNC_AUTH_INVALID_TIMESTAMP".into(),
            }),
        )
    })?;

    let header_body_sha256 = headers
        .get("x-vg-body-sha256")
        .and_then(|v| v.to_str().ok())
        .ok_or_else(|| {
            (
                StatusCode::UNAUTHORIZED,
                Json(ErrorMessage {
                    error: "ERR_SYNC_AUTH_MISSING_BODY_SHA256".into(),
                }),
            )
        })?;

    let signature = headers
        .get("x-vg-signature")
        .and_then(|v| v.to_str().ok())
        .ok_or_else(|| {
            (
                StatusCode::UNAUTHORIZED,
                Json(ErrorMessage {
                    error: "ERR_SYNC_AUTH_MISSING_SIGNATURE".into(),
                }),
            )
        })?;

    // Verify timestamp skew
    let now = chrono::Utc::now().timestamp_millis();
    if (now - timestamp).abs() > MAX_TIMESTAMP_SKEW_MS {
        return Err((
            StatusCode::UNAUTHORIZED,
            Json(ErrorMessage {
                error: "ERR_SYNC_AUTH_TIMESTAMP_SKEW_EXCEEDED".into(),
            }),
        ));
    }

    // Verify body SHA-256
    let actual_body_sha256 = compute_sha256_hex(body_bytes);
    if actual_body_sha256.to_lowercase() != header_body_sha256.to_lowercase() {
        return Err((
            StatusCode::UNAUTHORIZED,
            Json(ErrorMessage {
                error: "ERR_SYNC_AUTH_BODY_DIGEST_MISMATCH".into(),
            }),
        ));
    }

    // Atomically consume single-use challenge nonce
    let consumed = db
        .consume_challenge(challenge_nonce, account_id, device_id)
        .await
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorMessage {
                    error: e.to_string(),
                }),
            )
        })?;

    if !consumed {
        return Err((
            StatusCode::UNAUTHORIZED,
            Json(ErrorMessage {
                error: "ERR_SYNC_AUTH_INVALID_CHALLENGE".into(),
            }),
        ));
    }

    // Fetch account from DB
    let account = db
        .get_account(account_id)
        .await
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorMessage {
                    error: e.to_string(),
                }),
            )
        })?
        .ok_or_else(|| {
            (
                StatusCode::UNAUTHORIZED,
                Json(ErrorMessage {
                    error: "ERR_SYNC_ACCOUNT_NOT_FOUND".into(),
                }),
            )
        })?;

    // Verify Ed25519 signature over canonical preimage
    let preimage = build_auth_preimage(
        challenge_nonce,
        account_id,
        device_id,
        timestamp,
        &actual_body_sha256,
    );

    let is_valid = verify_signature(&account.account_auth_pub_key, &preimage, signature)
        .map_err(|e| {
            (
                StatusCode::UNAUTHORIZED,
                Json(ErrorMessage {
                    error: e.to_string(),
                }),
            )
        })?;

    if !is_valid {
        return Err((
            StatusCode::UNAUTHORIZED,
            Json(ErrorMessage {
                error: "ERR_SYNC_AUTH_SIGNATURE_INVALID".into(),
            }),
        ));
    }

    // Enforce Device Trust & Revocation Status
    let device_opt = db
        .get_device(account_id, device_id)
        .await
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorMessage {
                    error: e.to_string(),
                }),
            )
        })?;

    match device_opt {
        Some(dev) => {
            if dev.status != "TRUSTED" {
                return Err((
                    StatusCode::FORBIDDEN,
                    Json(ErrorMessage {
                        error: format!("ERR_DEVICE_NOT_TRUSTED_{}", dev.status),
                    }),
                ));
            }
            let _ = db.touch_device_last_seen(account_id, device_id).await;
        }
        None => {
            // Check if any trusted devices exist for this account
            let trusted_count = db.count_trusted_devices(account_id).await.unwrap_or(0);
            if trusted_count > 0 && device_id != account.device_id {
                return Err((
                    StatusCode::FORBIDDEN,
                    Json(ErrorMessage {
                        error: "ERR_DEVICE_AUTHORIZATION_REQUIRED".into(),
                    }),
                ));
            }
            // Backfill primary device as TRUSTED
            let short_code =
                compute_device_short_code(account_id, device_id, &account.account_auth_pub_key);
            let primary_dev = DeviceRow {
                account_id: account_id.to_string(),
                device_id: device_id.to_string(),
                device_name: "Primary Device".to_string(),
                device_auth_pub_key: account.account_auth_pub_key.clone(),
                status: "TRUSTED".to_string(),
                short_code,
                approved_by_device_id: Some(device_id.to_string()),
                approval_signature: None,
                last_seen_at: now,
                created_at: now,
            };
            let _ = db.upsert_device(&primary_dev).await;
        }
    }

    Ok((account, device_id.to_string()))
}

// --- Route Handlers ---

/// POST /v1/auth/register
pub async fn register_handler(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    connect_info: Option<ConnectInfo<SocketAddr>>,
    Json(payload): Json<RegisterRequest>,
) -> impl IntoResponse {
    let client_ip =
        RateLimiter::extract_client_ip(&headers, connect_info, state.trusted_proxy);
    if !state
        .rate_limiter
        .check_scoped_rate_limit(
            "auth",
            &client_ip,
            AUTH_RATE_LIMIT_PER_MIN,
            RATE_LIMIT_WINDOW_MS,
        )
        .await
    {
        return (
            StatusCode::TOO_MANY_REQUESTS,
            Json(ErrorMessage {
                error: "ERR_RATE_LIMIT_EXCEEDED".into(),
            }),
        )
            .into_response();
    }

    let preimage =
        build_register_preimage(&payload.account_id, &payload.account_auth_pub_key);

    let valid = match verify_signature(
        &payload.account_auth_pub_key,
        &preimage,
        &payload.registration_signature,
    ) {
        Ok(v) => v,
        Err(e) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(ErrorMessage {
                    error: e.to_string(),
                }),
            )
                .into_response()
        }
    };

    if !valid {
        return (
            StatusCode::UNAUTHORIZED,
            Json(ErrorMessage {
                error: "ERR_SYNC_REGISTRATION_SIGNATURE_INVALID".into(),
            }),
        )
            .into_response();
    }

    let resolved_device_pub = payload
        .device_auth_pub_key
        .as_deref()
        .unwrap_or(&payload.account_auth_pub_key);
    let short_code = compute_device_short_code(
        &payload.account_id,
        &payload.device_id,
        resolved_device_pub,
    );

    match state
        .db
        .register_or_update_account(
            &payload.account_id,
            &payload.device_id,
            payload.device_name.as_deref(),
            &payload.account_auth_pub_key,
            payload.recovery_auth_pub_key.as_deref(),
            payload.device_auth_pub_key.as_deref(),
            &short_code,
            &payload.encrypted_header,
        )
        .await
    {
        Ok(vault_seq) => (
            StatusCode::OK,
            Json(RegisterResponse {
                ok: true,
                account_id: payload.account_id,
                vault_seq,
                device_status: "TRUSTED".to_string(),
            }),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorMessage {
                error: e.to_string(),
            }),
        )
            .into_response(),
    }
}

/// POST /v1/auth/challenge
pub async fn challenge_handler(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    connect_info: Option<ConnectInfo<SocketAddr>>,
    Json(payload): Json<ChallengeRequest>,
) -> impl IntoResponse {
    let client_ip =
        RateLimiter::extract_client_ip(&headers, connect_info, state.trusted_proxy);
    if !state
        .rate_limiter
        .check_scoped_rate_limit(
            "auth",
            &client_ip,
            AUTH_RATE_LIMIT_PER_MIN,
            RATE_LIMIT_WINDOW_MS,
        )
        .await
    {
        return (
            StatusCode::TOO_MANY_REQUESTS,
            Json(ErrorMessage {
                error: "ERR_RATE_LIMIT_EXCEEDED".into(),
            }),
        )
            .into_response();
    }

    let challenge_nonce = generate_challenge_nonce();
    let now = chrono::Utc::now().timestamp_millis();
    let expires_at = now + CHALLENGE_TTL_MS;

    match state
        .db
        .save_challenge(
            &challenge_nonce,
            &payload.account_id,
            &payload.device_id,
            expires_at,
        )
        .await
    {
        Ok(_) => (
            StatusCode::OK,
            Json(ChallengeResponse {
                challenge_nonce,
                expires_at,
            }),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorMessage {
                error: e.to_string(),
            }),
        )
            .into_response(),
    }
}

/// POST /v1/auth/verify
pub async fn verify_handler(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    connect_info: Option<ConnectInfo<SocketAddr>>,
    Json(payload): Json<VerifyRequest>,
) -> impl IntoResponse {
    let client_ip =
        RateLimiter::extract_client_ip(&headers, connect_info, state.trusted_proxy);
    if !state
        .rate_limiter
        .check_scoped_rate_limit(
            "auth",
            &client_ip,
            AUTH_RATE_LIMIT_PER_MIN,
            RATE_LIMIT_WINDOW_MS,
        )
        .await
    {
        return (
            StatusCode::TOO_MANY_REQUESTS,
            Json(ErrorMessage {
                error: "ERR_RATE_LIMIT_EXCEEDED".into(),
            }),
        )
            .into_response();
    }

    let now = chrono::Utc::now().timestamp_millis();
    if (now - payload.timestamp).abs() > MAX_TIMESTAMP_SKEW_MS {
        return (
            StatusCode::UNAUTHORIZED,
            Json(ErrorMessage {
                error: "ERR_SYNC_AUTH_TIMESTAMP_SKEW_EXCEEDED".into(),
            }),
        )
            .into_response();
    }

    let consumed = match state
        .db
        .consume_challenge(
            &payload.challenge_nonce,
            &payload.account_id,
            &payload.device_id,
        )
        .await
    {
        Ok(c) => c,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorMessage {
                    error: e.to_string(),
                }),
            )
                .into_response()
        }
    };

    if !consumed {
        return (
            StatusCode::UNAUTHORIZED,
            Json(ErrorMessage {
                error: "ERR_SYNC_AUTH_INVALID_CHALLENGE".into(),
            }),
        )
            .into_response();
    }

    let account = match state.db.get_account(&payload.account_id).await {
        Ok(Some(a)) => a,
        Ok(None) => {
            return (
                StatusCode::NOT_FOUND,
                Json(ErrorMessage {
                    error: "ERR_SYNC_ACCOUNT_NOT_FOUND".into(),
                }),
            )
                .into_response()
        }
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorMessage {
                    error: e.to_string(),
                }),
            )
                .into_response()
        }
    };

    let preimage = build_auth_preimage(
        &payload.challenge_nonce,
        &payload.account_id,
        &payload.device_id,
        payload.timestamp,
        &payload.body_sha256,
    );

    let is_valid = match verify_signature(
        &account.account_auth_pub_key,
        &preimage,
        &payload.signature,
    ) {
        Ok(v) => v,
        Err(e) => {
            return (
                StatusCode::UNAUTHORIZED,
                Json(ErrorMessage {
                    error: e.to_string(),
                }),
            )
                .into_response()
        }
    };

    if !is_valid {
        return (
            StatusCode::UNAUTHORIZED,
            Json(ErrorMessage {
                error: "ERR_SYNC_AUTH_SIGNATURE_INVALID".into(),
            }),
        )
            .into_response();
    }

    (StatusCode::OK, Json(GenericOkResponse { ok: true })).into_response()
}

// ── New Device Authorization & Revocation Endpoints ──────────────────────────

/// POST /v1/device/request
/// Step 1: New device sends `deviceId`, `deviceAuthPubKey`, and a signed challenge.
/// Step 2: Server checks `devices` table for active `TRUSTED` devices for this account.
/// Step 3: If active trusted devices exist, registers device as `PENDING` and emits a `NEW_DEVICE_ATTEMPT` event.
/// Step 6 (Recovery Exception): If a valid detached Ed25519 `recoverySignature` (signed by the 24-Word Recovery Kit's
/// `VG_RAU_1` authority key) is provided, immediately marks the device `TRUSTED` and bypasses interactive approval.
pub async fn device_request_handler(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    connect_info: Option<ConnectInfo<SocketAddr>>,
    Json(payload): Json<DeviceAuthRequestPayload>,
) -> impl IntoResponse {
    let client_ip =
        RateLimiter::extract_client_ip(&headers, connect_info, state.trusted_proxy);
    if !state
        .rate_limiter
        .check_scoped_rate_limit(
            "device",
            &client_ip,
            DEVICE_RATE_LIMIT_PER_MIN,
            RATE_LIMIT_WINDOW_MS,
        )
        .await
    {
        return (
            StatusCode::TOO_MANY_REQUESTS,
            Json(ErrorMessage {
                error: "ERR_RATE_LIMIT_EXCEEDED".into(),
            }),
        )
            .into_response();
    }

    let now = chrono::Utc::now().timestamp_millis();
    if (now - payload.timestamp).abs() > MAX_TIMESTAMP_SKEW_MS {
        return (
            StatusCode::UNAUTHORIZED,
            Json(ErrorMessage {
                error: "ERR_DEVICE_REQ_TIMESTAMP_SKEW_EXCEEDED".into(),
            }),
        )
            .into_response();
    }

    // Atomically consume challenge nonce
    let consumed = match state
        .db
        .consume_challenge(
            &payload.challenge_nonce,
            &payload.account_id,
            &payload.device_id,
        )
        .await
    {
        Ok(c) => c,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorMessage {
                    error: e.to_string(),
                }),
            )
                .into_response()
        }
    };

    if !consumed {
        return (
            StatusCode::UNAUTHORIZED,
            Json(ErrorMessage {
                error: "ERR_DEVICE_REQ_INVALID_CHALLENGE".into(),
            }),
        )
            .into_response();
    }

    let account = match state.db.get_account(&payload.account_id).await {
        Ok(Some(a)) => a,
        Ok(None) => {
            return (
                StatusCode::NOT_FOUND,
                Json(ErrorMessage {
                    error: "ERR_SYNC_ACCOUNT_NOT_FOUND".into(),
                }),
            )
                .into_response()
        }
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorMessage {
                    error: e.to_string(),
                }),
            )
                .into_response()
        }
    };

    let req_preimage = build_device_request_preimage(
        &payload.challenge_nonce,
        &payload.account_id,
        &payload.device_id,
        &payload.device_auth_pub_key,
        payload.timestamp,
    );

    // Verify request signature against either the account's auth key or the device's own Ed25519 key
    let sig_valid_account =
        verify_signature(&account.account_auth_pub_key, &req_preimage, &payload.signature)
            .unwrap_or(false);
    let sig_valid_device =
        verify_signature(&payload.device_auth_pub_key, &req_preimage, &payload.signature)
            .unwrap_or(false);

    if !sig_valid_account && !sig_valid_device {
        return (
            StatusCode::UNAUTHORIZED,
            Json(ErrorMessage {
                error: "ERR_DEVICE_REQ_SIGNATURE_INVALID".into(),
            }),
        )
            .into_response();
    }

    // Check Step 6: 24-Word Recovery Kit Cryptographic Bypass
    let mut bypass_used = false;
    if let Some(ref rec_sig) = payload.recovery_signature {
        let rec_preimage = build_device_recovery_preimage(
            &payload.challenge_nonce,
            &payload.account_id,
            &payload.device_id,
            &payload.device_auth_pub_key,
            payload.timestamp,
        );

        let candidate_rec_pub = account
            .recovery_auth_pub_key
            .as_deref()
            .or(payload.recovery_auth_pub_key.as_deref());

        if let Some(rec_pub) = candidate_rec_pub {
            let rec_valid = verify_signature(rec_pub, &rec_preimage, rec_sig).unwrap_or(false);
            if !rec_valid {
                return (
                    StatusCode::UNAUTHORIZED,
                    Json(ErrorMessage {
                        error: "ERR_DEVICE_RECOVERY_SIGNATURE_INVALID".into(),
                    }),
                )
                    .into_response();
            }
            if account.recovery_auth_pub_key.is_none() {
                let _ = state
                    .db
                    .set_recovery_auth_pub_key_if_unset(&account.account_id, rec_pub)
                    .await;
            }
            bypass_used = true;
        } else {
            return (
                StatusCode::UNAUTHORIZED,
                Json(ErrorMessage {
                    error: "ERR_DEVICE_RECOVERY_KEY_NOT_REGISTERED".into(),
                }),
            )
                .into_response();
        }
    }

    let short_code = compute_device_short_code(
        &payload.account_id,
        &payload.device_id,
        &payload.device_auth_pub_key,
    );
    let device_name = payload
        .device_name
        .unwrap_or_else(|| "New Arca Device".to_string());

    // Check if this device already exists or if any active TRUSTED devices exist
    let existing_device = state
        .db
        .get_device(&account.account_id, &payload.device_id)
        .await
        .unwrap_or(None);

    let trusted_count = state
        .db
        .count_trusted_devices(&account.account_id)
        .await
        .unwrap_or(0);

    let should_auto_trust = bypass_used
        || trusted_count == 0
        || existing_device
            .as_ref()
            .map(|d| d.status == "TRUSTED")
            .unwrap_or(false);

    let final_status = if should_auto_trust {
        "TRUSTED".to_string()
    } else {
        "PENDING".to_string()
    };

    let approved_by = if bypass_used {
        Some("RECOVERY_KIT_24_WORDS".to_string())
    } else if should_auto_trust {
        Some(payload.device_id.clone())
    } else {
        None
    };

    let device_row = DeviceRow {
        account_id: account.account_id.clone(),
        device_id: payload.device_id.clone(),
        device_name: device_name.clone(),
        device_auth_pub_key: payload.device_auth_pub_key.clone(),
        status: final_status.clone(),
        short_code: short_code.clone(),
        approved_by_device_id: approved_by,
        approval_signature: payload.recovery_signature.clone(),
        last_seen_at: now,
        created_at: existing_device.map(|d| d.created_at).unwrap_or(now),
    };

    if let Err(e) = state.db.upsert_device(&device_row).await {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorMessage {
                error: e.to_string(),
            }),
        )
            .into_response();
    }

    if final_status == "TRUSTED" {
        (
            StatusCode::OK,
            Json(DeviceAuthRequestResponse {
                ok: true,
                status: "TRUSTED".to_string(),
                bypass_used,
                device_id: payload.device_id,
                short_code,
                encrypted_header: Some(account.encrypted_header),
                encrypted_manifest: account.encrypted_manifest,
                vault_seq: Some(account.vault_seq),
                event: None,
            }),
        )
            .into_response()
    } else {
        let event = NewDeviceAttemptEvent {
            event_type: "NEW_DEVICE_ATTEMPT".to_string(),
            new_device_id: payload.device_id.clone(),
            device_name,
            device_auth_pub_key: payload.device_auth_pub_key,
            short_code: short_code.clone(),
            requested_at: now,
        };
        (
            StatusCode::ACCEPTED,
            Json(DeviceAuthRequestResponse {
                ok: true,
                status: "PENDING".to_string(),
                bypass_used: false,
                device_id: payload.device_id,
                short_code,
                encrypted_header: None,
                encrypted_manifest: None,
                vault_seq: None,
                event: Some(event),
            }),
        )
            .into_response()
    }
}

/// POST /v1/device/approve
/// Step 4 & 5: Existing TRUSTED device approves or denies a pending `NEW_DEVICE_ATTEMPT`.
pub async fn device_approve_handler(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    connect_info: Option<ConnectInfo<SocketAddr>>,
    body: Bytes,
) -> impl IntoResponse {
    let client_ip =
        RateLimiter::extract_client_ip(&headers, connect_info, state.trusted_proxy);
    if !state
        .rate_limiter
        .check_scoped_rate_limit(
            "device",
            &client_ip,
            DEVICE_RATE_LIMIT_PER_MIN,
            RATE_LIMIT_WINDOW_MS,
        )
        .await
    {
        return (
            StatusCode::TOO_MANY_REQUESTS,
            Json(ErrorMessage {
                error: "ERR_RATE_LIMIT_EXCEEDED".into(),
            }),
        )
            .into_response();
    }

    let (account, approver_device_id) =
        match authenticate_request(&state.db, &headers, &body).await {
            Ok(res) => res,
            Err((status, err)) => return (status, err).into_response(),
        };

    let payload: DeviceApproveRequest = match serde_json::from_slice(&body) {
        Ok(p) => p,
        Err(e) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(ErrorMessage {
                    error: format!("Invalid approval payload: {}", e),
                }),
            )
                .into_response()
        }
    };

    let target_device = match state
        .db
        .get_device(&account.account_id, &payload.target_device_id)
        .await
    {
        Ok(Some(d)) => d,
        Ok(None) => {
            return (
                StatusCode::NOT_FOUND,
                Json(ErrorMessage {
                    error: "ERR_TARGET_DEVICE_NOT_FOUND".into(),
                }),
            )
                .into_response()
        }
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorMessage {
                    error: e.to_string(),
                }),
            )
                .into_response()
        }
    };

    // If an explicit cryptographic approval signature is provided, verify it against the account's public key
    if let Some(ref app_sig) = payload.approval_signature {
        let approval_preimage = build_device_approval_preimage(
            &account.account_id,
            &approver_device_id,
            &target_device.device_id,
            &target_device.device_auth_pub_key,
            payload.approve,
        );
        let valid = verify_signature(&account.account_auth_pub_key, &approval_preimage, app_sig)
            .unwrap_or(false);
        if !valid {
            return (
                StatusCode::UNAUTHORIZED,
                Json(ErrorMessage {
                    error: "ERR_DEVICE_APPROVAL_SIGNATURE_INVALID".into(),
                }),
            )
                .into_response();
        }
    }

    match state
        .db
        .approve_or_deny_device(
            &account.account_id,
            &payload.target_device_id,
            payload.approve,
            &approver_device_id,
            payload.approval_signature.as_deref(),
        )
        .await
    {
        Ok(true) => {
            let next_status = if payload.approve {
                "TRUSTED"
            } else {
                "REVOKED"
            };
            (
                StatusCode::OK,
                Json(DeviceApproveResponse {
                    ok: true,
                    target_device_id: payload.target_device_id,
                    status: next_status.to_string(),
                }),
            )
                .into_response()
        }
        Ok(false) => (
            StatusCode::NOT_FOUND,
            Json(ErrorMessage {
                error: "ERR_TARGET_DEVICE_NOT_FOUND".into(),
            }),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorMessage {
                error: e.to_string(),
            }),
        )
            .into_response(),
    }
}

/// GET or POST /v1/device/list
/// Returns all devices (TRUSTED, PENDING, REVOKED) and emits `NEW_DEVICE_ATTEMPT` events for any pending devices.
pub async fn device_list_handler(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    body: Bytes,
) -> impl IntoResponse {
    let (account, _) = match authenticate_request(&state.db, &headers, &body).await {
        Ok(res) => res,
        Err((status, err)) => return (status, err).into_response(),
    };

    match state.db.list_devices(&account.account_id).await {
        Ok(rows) => {
            let pending_attempts: Vec<NewDeviceAttemptEvent> = rows
                .iter()
                .filter(|r| r.status == "PENDING")
                .map(|r| NewDeviceAttemptEvent {
                    event_type: "NEW_DEVICE_ATTEMPT".to_string(),
                    new_device_id: r.device_id.clone(),
                    device_name: r.device_name.clone(),
                    device_auth_pub_key: r.device_auth_pub_key.clone(),
                    short_code: r.short_code.clone(),
                    requested_at: r.created_at,
                })
                .collect();

            let devices: Vec<DeviceDto> = rows.into_iter().map(DeviceDto::from).collect();
            (
                StatusCode::OK,
                Json(DeviceListResponse {
                    ok: true,
                    devices,
                    pending_attempts,
                }),
            )
                .into_response()
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorMessage {
                error: e.to_string(),
            }),
        )
            .into_response(),
    }
}

/// POST /v1/device/revoke
/// Instantly revokes a device's session and purges its active challenge nonces.
pub async fn device_revoke_handler(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    connect_info: Option<ConnectInfo<SocketAddr>>,
    body: Bytes,
) -> impl IntoResponse {
    let client_ip =
        RateLimiter::extract_client_ip(&headers, connect_info, state.trusted_proxy);
    if !state
        .rate_limiter
        .check_scoped_rate_limit(
            "device",
            &client_ip,
            DEVICE_RATE_LIMIT_PER_MIN,
            RATE_LIMIT_WINDOW_MS,
        )
        .await
    {
        return (
            StatusCode::TOO_MANY_REQUESTS,
            Json(ErrorMessage {
                error: "ERR_RATE_LIMIT_EXCEEDED".into(),
            }),
        )
            .into_response();
    }

    let (account, _) = match authenticate_request(&state.db, &headers, &body).await {
        Ok(res) => res,
        Err((status, err)) => return (status, err).into_response(),
    };

    let payload: DeviceRevokeRequest = match serde_json::from_slice(&body) {
        Ok(p) => p,
        Err(e) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(ErrorMessage {
                    error: format!("Invalid revoke payload: {}", e),
                }),
            )
                .into_response()
        }
    };

    match state
        .db
        .revoke_device(&account.account_id, &payload.target_device_id)
        .await
    {
        Ok(true) => (
            StatusCode::OK,
            Json(DeviceRevokeResponse {
                ok: true,
                revoked_device_id: payload.target_device_id,
                status: "REVOKED".to_string(),
            }),
        )
            .into_response(),
        Ok(false) => (
            StatusCode::NOT_FOUND,
            Json(ErrorMessage {
                error: "ERR_TARGET_DEVICE_NOT_FOUND".into(),
            }),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorMessage {
                error: e.to_string(),
            }),
        )
            .into_response(),
    }
}

// ── Delta & Push Sync Endpoints (Trusted Devices Only) ───────────────────────

/// GET /v1/sync/delta?sinceSeq=<u64>
pub async fn delta_handler(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(query): Query<DeltaQuery>,
) -> impl IntoResponse {
    let (account, _) = match authenticate_request(&state.db, &headers, b"").await {
        Ok(a) => a,
        Err((status, err)) => return (status, err).into_response(),
    };

    match state
        .db
        .get_sync_items_since(&account.account_id, query.since_seq)
        .await
    {
        Ok(items) => {
            let dtos: Vec<SyncItemDto> = items.into_iter().map(SyncItemDto::from).collect();
            (
                StatusCode::OK,
                Json(DeltaResponse {
                    current_vault_seq: account.vault_seq,
                    encrypted_header: account.encrypted_header,
                    encrypted_manifest: account.encrypted_manifest,
                    items: dtos,
                }),
            )
                .into_response()
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorMessage {
                error: e.to_string(),
            }),
        )
            .into_response(),
    }
}

/// POST /v1/sync/push
pub async fn push_handler(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    body: Bytes,
) -> impl IntoResponse {
    let (account, _) = match authenticate_request(&state.db, &headers, &body).await {
        Ok(a) => a,
        Err((status, err)) => return (status, err).into_response(),
    };

    let payload: PushRequest = match serde_json::from_slice(&body) {
        Ok(p) => p,
        Err(e) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(ErrorMessage {
                    error: format!("Invalid push payload: {}", e),
                }),
            )
                .into_response()
        }
    };

    // Optimistic CAS concurrency check
    if payload.expected_vault_seq != 0 && payload.expected_vault_seq != account.vault_seq {
        return (
            StatusCode::CONFLICT,
            Json(PushConflictResponse {
                ok: false,
                error: "ERR_SYNC_CAS_CONFLICT".into(),
                current_vault_seq: account.vault_seq,
            }),
        )
            .into_response();
    }

    let mut applied_count = 0;
    let mut skipped_stale_count = 0;
    let next_vault_seq = account.vault_seq + 1;

    for item_dto in payload.items {
        let incoming_record = SyncItemRecord::from(item_dto);
        let existing = match state
            .db
            .get_existing_item(&account.account_id, &incoming_record.item_id)
            .await
        {
            Ok(e) => e,
            Err(e) => {
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(ErrorMessage {
                        error: e.to_string(),
                    }),
                )
                    .into_response()
            }
        };

        let should_apply = match existing {
            Some(ref ext) => should_incoming_sync_item_win(&incoming_record, ext),
            None => true,
        };

        if should_apply {
            if let Err(e) = state
                .db
                .upsert_sync_item(&account.account_id, &incoming_record, next_vault_seq)
                .await
            {
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(ErrorMessage {
                        error: e.to_string(),
                    }),
                )
                    .into_response();
            }
            applied_count += 1;
        } else {
            skipped_stale_count += 1;
        }
    }

    if let Err(e) = state
        .db
        .update_account_vault_seq_and_manifest(
            &account.account_id,
            next_vault_seq,
            payload.encrypted_manifest.as_deref(),
        )
        .await
    {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorMessage {
                error: e.to_string(),
            }),
        )
            .into_response();
    }

    (
        StatusCode::OK,
        Json(PushSuccessResponse {
            ok: true,
            new_vault_seq: next_vault_seq,
            applied_count,
            skipped_stale_count,
        }),
    )
        .into_response()
}

/// DELETE /v1/account
pub async fn delete_account_handler(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> impl IntoResponse {
    let (account, _) = match authenticate_request(&state.db, &headers, b"").await {
        Ok(a) => a,
        Err((status, err)) => return (status, err).into_response(),
    };

    match state.db.delete_account(&account.account_id).await {
        Ok(_) => (StatusCode::OK, Json(GenericOkResponse { ok: true })).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorMessage {
                error: e.to_string(),
            }),
        )
            .into_response(),
    }
}
