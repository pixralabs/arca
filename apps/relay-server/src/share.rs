//! apps/relay-server/src/share.rs
//! Bot-Crawler-Safe One-Time Ephemeral Sharing API (Patch VG-04 & Patch VG-02 Rate Limiter).

use axum::{
    extract::{ConnectInfo, HeaderMap, Path, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use serde::{Deserialize, Serialize};
use std::net::SocketAddr;
use std::sync::Arc;

use crate::{db::Db, rate_limit::RateLimiter};

pub const DEFAULT_SHARE_TTL_MS: i64 = 3_600_000; // 1 hour

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
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GetShareResponse {
    pub share_id: String,
    pub encrypted_payload: String,
    pub expires_at: i64,
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

fn resolve_client_ip(
    headers: &HeaderMap,
    connect_info: Option<ConnectInfo<SocketAddr>>,
    trusted_proxy: bool,
) -> String {
    if trusted_proxy {
        if let Some(forwarded) = headers.get("x-forwarded-for") {
            if let Ok(val) = forwarded.to_str() {
                if let Some(first_ip) = val.split(',').next() {
                    return first_ip.trim().to_string();
                }
            }
        }
        if let Some(real_ip) = headers.get("x-real-ip") {
            if let Ok(val) = real_ip.to_str() {
                return val.trim().to_string();
            }
        }
    }

    if let Some(ConnectInfo(addr)) = connect_info {
        return addr.ip().to_string();
    }

    "127.0.0.1".to_string()
}

/// POST /v1/share/create (5 req/min rate limit per client IP)
pub async fn create_share_handler(
    State(state): State<Arc<ShareState>>,
    headers: HeaderMap,
    connect_info: Option<ConnectInfo<SocketAddr>>,
    Json(payload): Json<CreateShareRequest>,
) -> impl IntoResponse {
    let client_ip = resolve_client_ip(&headers, connect_info, state.trusted_proxy);

    // Patch VG-02: Enforce 5 req / 60 seconds rate limit
    let allowed = state
        .rate_limiter
        .check_rate_limit(&client_ip, 5, 60_000)
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

    let ttl_ms = payload.ttl_ms.unwrap_or(DEFAULT_SHARE_TTL_MS);
    let now = chrono::Utc::now().timestamp_millis();
    let expires_at = now + ttl_ms;
    let max_views = payload.max_views.unwrap_or(1);

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
/// Bot-Crawler-Safe: NEVER increments view_count on GET!
pub async fn get_share_handler(
    State(state): State<Arc<ShareState>>,
    Path(share_id): Path<String>,
) -> impl IntoResponse {
    match state.db.get_share(&share_id).await {
        Ok(Some(share)) => (
            StatusCode::OK,
            Json(GetShareResponse {
                share_id: share.share_id,
                encrypted_payload: share.encrypted_payload,
                expires_at: share.expires_at,
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
/// Requires matching burnToken to destroy ciphertext on the server.
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
