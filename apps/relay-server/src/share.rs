//! apps/relay-server/src/share.rs
//! One-Time Ephemeral Sharing API — Encrypted with URL Fragment Key & Burned After First View OR 5 Minutes.

use axum::{
    extract::{ConnectInfo, Path, State},
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
    Json,
};
use serde::{Deserialize, Serialize};
use std::net::SocketAddr;
use std::sync::Arc;

use crate::{
    db::Db,
    rate_limit::{RateLimiter, RATE_LIMIT_WINDOW_MS, SHARE_RATE_LIMIT_PER_MIN},
};

/// Strict 5-minute (300,000 ms) default and maximum TTL for one-time ephemeral share links.
pub const DEFAULT_SHARE_TTL_MS: i64 = 300_000; // 5 minutes
pub const MAX_SHARE_TTL_MS: i64 = 300_000; // 5 minutes hard ceiling

#[derive(Clone)]
pub struct ShareState {
    pub db: Db,
    pub rate_limiter: RateLimiter,
    pub trusted_proxy: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateShareRequest {
    pub share_id: Option<String>,
    pub encrypted_payload: String,
    pub burn_token: String,
    pub ttl_ms: Option<i64>,
    pub max_views: Option<i32>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateShareResponse {
    pub share_id: String,
    pub expires_at: i64,
    pub max_views: i32,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GetShareResponse {
    pub share_id: String,
    pub encrypted_payload: String,
    pub expires_at: i64,
    pub burned: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BurnShareRequest {
    pub burn_token: String,
}

#[derive(Debug, Serialize)]
pub struct OkResponse {
    pub ok: bool,
}

#[derive(Debug, Serialize)]
pub struct ErrorResponse {
    pub error: String,
}

/// POST /v1/share/create (5 req/min rate limit per client IP, max 5-minute TTL, max 1 view)
pub async fn create_share_handler(
    State(state): State<Arc<ShareState>>,
    headers: HeaderMap,
    connect_info: Option<ConnectInfo<SocketAddr>>,
    Json(payload): Json<CreateShareRequest>,
) -> impl IntoResponse {
    let client_ip =
        RateLimiter::extract_client_ip(&headers, connect_info, state.trusted_proxy);

    let allowed = state
        .rate_limiter
        .check_scoped_rate_limit(
            "share",
            &client_ip,
            SHARE_RATE_LIMIT_PER_MIN,
            RATE_LIMIT_WINDOW_MS,
        )
        .await;
    if !allowed {
        return (
            StatusCode::TOO_MANY_REQUESTS,
            Json(ErrorResponse {
                error: "ERR_RATE_LIMIT_EXCEEDED".into(),
            }),
        )
            .into_response();
    }

    if payload.encrypted_payload.trim().is_empty() || payload.burn_token.trim().is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: "ERR_SHARE_INVALID_PAYLOAD".into(),
            }),
        )
            .into_response();
    }

    let share_id = payload
        .share_id
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| {
            let mut buf = [0u8; 16];
            rand::RngCore::fill_bytes(&mut rand::thread_rng(), &mut buf);
            hex::encode(buf)
        });

    // Enforce 5-minute maximum TTL (whichever comes first: 1st view or 5 minutes)
    let requested_ttl = payload.ttl_ms.unwrap_or(DEFAULT_SHARE_TTL_MS);
    let bounded_ttl = requested_ttl.clamp(1_000, MAX_SHARE_TTL_MS);
    let now = chrono::Utc::now().timestamp_millis();
    let expires_at = now + bounded_ttl;
    let max_views = 1; // Strictly one-time view

    match state
        .db
        .create_share(
            &share_id,
            &payload.encrypted_payload,
            &payload.burn_token,
            expires_at,
            max_views,
        )
        .await
    {
        Ok(_) => (
            StatusCode::OK,
            Json(CreateShareResponse {
                share_id,
                expires_at,
                max_views,
            }),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: e.to_string(),
            }),
        )
            .into_response(),
    }
}

/// GET /v1/share/:id
/// Atomically retrieves and burns (deletes) the share on first view (unless `x-vg-peek-only: true` is set
/// by a preflight check), and purges any share older than 5 minutes.
pub async fn get_share_handler(
    State(state): State<Arc<ShareState>>,
    headers: HeaderMap,
    Path(share_id): Path<String>,
) -> impl IntoResponse {
    let peek_only = headers
        .get("x-vg-peek-only")
        .and_then(|v| v.to_str().ok())
        .map(|v| v.eq_ignore_ascii_case("true") || v == "1")
        .unwrap_or(false);

    match state
        .db
        .get_and_burn_share_on_view(&share_id, !peek_only)
        .await
    {
        Ok(Some(share)) => (
            StatusCode::OK,
            Json(GetShareResponse {
                share_id: share.share_id,
                encrypted_payload: share.encrypted_payload,
                expires_at: share.expires_at,
                burned: !peek_only,
            }),
        )
            .into_response(),
        Ok(None) => (
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: "ERR_SHARE_EXPIRED_OR_CONSUMED".into(),
            }),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: e.to_string(),
            }),
        )
            .into_response(),
    }
}

/// POST /v1/share/:id/burn
/// Explicitly burns the share using `burnToken` derived from the URL fragment key.
pub async fn burn_share_handler(
    State(state): State<Arc<ShareState>>,
    Path(share_id): Path<String>,
    Json(payload): Json<BurnShareRequest>,
) -> impl IntoResponse {
    match state.db.burn_share(&share_id, &payload.burn_token).await {
        Ok(true) => (StatusCode::OK, Json(OkResponse { ok: true })).into_response(),
        Ok(false) => (
            StatusCode::FORBIDDEN,
            Json(ErrorResponse {
                error: "ERR_SHARE_INVALID_BURN_TOKEN".into(),
            }),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: e.to_string(),
            }),
        )
            .into_response(),
    }
}
