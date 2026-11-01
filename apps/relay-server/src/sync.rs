//! apps/relay-server/src/sync.rs
//! Zero-Knowledge Blind Relay Sync API (Ed25519 Challenge-Response, HLC CRDT & CAS).

use axum::{
    body::Bytes,
    extract::{Query, State},
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
    Json,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use crate::{
    auth::{
        build_auth_preimage, build_register_preimage, compute_sha256_hex,
        generate_challenge_nonce, verify_signature,
    },
    crdt::{should_incoming_sync_item_win, SyncItemRecord},
    db::{AccountRow, Db},
};

pub const CHALLENGE_TTL_MS: i64 = 300_000; // 5 minutes
pub const MAX_TIMESTAMP_SKEW_MS: i64 = 300_000; // 5 minutes

#[derive(Clone)]
pub struct AppState {
    pub db: Db,
}

// --- DTOs ---

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegisterRequest {
    pub account_id: String,
    pub device_id: String,
    pub account_auth_pub_key: String,
    pub encrypted_header: String,
    pub registration_signature: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RegisterResponse {
    pub ok: bool,
    pub account_id: String,
    pub vault_seq: u64,
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

#[derive(Debug, Serialize)]
pub struct GenericOkResponse {
    pub ok: bool,
}

#[derive(Debug, Serialize)]
pub struct ErrorMessage {
    pub error: String,
}

// --- Auth Extraction & Verification ---

async fn authenticate_request(
    db: &Db,
    headers: &HeaderMap,
    body_bytes: &[u8],
) -> Result<AccountRow, (StatusCode, Json<ErrorMessage>)> {
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

    Ok(account)
}

// --- Route Handlers ---

/// POST /v1/auth/register
pub async fn register_handler(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<RegisterRequest>,
) -> impl IntoResponse {
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

    match state
        .db
        .register_or_update_account(
            &payload.account_id,
            &payload.device_id,
            &payload.account_auth_pub_key,
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
    Json(payload): Json<ChallengeRequest>,
) -> impl IntoResponse {
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
    Json(payload): Json<VerifyRequest>,
) -> impl IntoResponse {
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

/// GET /v1/sync/delta?sinceSeq=<u64>
pub async fn delta_handler(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(query): Query<DeltaQuery>,
) -> impl IntoResponse {
    let account = match authenticate_request(&state.db, &headers, b"").await {
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
    let account = match authenticate_request(&state.db, &headers, &body).await {
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
    let account = match authenticate_request(&state.db, &headers, b"").await {
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
