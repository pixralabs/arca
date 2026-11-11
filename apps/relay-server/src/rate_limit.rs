//! apps/relay-server/src/rate_limit.rs
//! Governor-style Sliding-Window IP Rate Limiter for `/v1/auth/*`, `/v1/device/*`, and `/v1/share/*`
//! Enforces strict brute-force protection using `ConnectInfo<SocketAddr>` (Patch VG-02).

use axum::http::HeaderMap;
use axum::extract::ConnectInfo;
use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::sync::Mutex;

/// Rate-limit policy tiers (requests per 60-second window per IP)
pub const AUTH_RATE_LIMIT_PER_MIN: usize = 15;
pub const DEVICE_RATE_LIMIT_PER_MIN: usize = 10;
pub const SHARE_RATE_LIMIT_PER_MIN: usize = 5;
pub const RATE_LIMIT_WINDOW_MS: i64 = 60_000;

#[derive(Clone, Default)]
pub struct RateLimiter {
    // bucket_key ("scope:ip") -> timestamps (in ms)
    history: Arc<Mutex<HashMap<String, Vec<i64>>>>,
}

impl RateLimiter {
    pub fn new() -> Self {
        Self {
            history: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Resolves client IP safely (Patch VG-02):
    /// Only trusts `X-Forwarded-For` / `X-Real-IP` when `trusted_proxy == true`.
    pub fn extract_client_ip(
        headers: &HeaderMap,
        connect_info: Option<ConnectInfo<SocketAddr>>,
        trusted_proxy: bool,
    ) -> String {
        if trusted_proxy {
            if let Some(forwarded) = headers.get("x-forwarded-for") {
                if let Ok(val) = forwarded.to_str() {
                    if let Some(first_ip) = val.split(',').next() {
                        let trimmed = first_ip.trim();
                        if !trimmed.is_empty() {
                            return trimmed.to_string();
                        }
                    }
                }
            }
            if let Some(real_ip) = headers.get("x-real-ip") {
                if let Ok(val) = real_ip.to_str() {
                    let trimmed = val.trim();
                    if !trimmed.is_empty() {
                        return trimmed.to_string();
                    }
                }
            }
        }

        if let Some(ConnectInfo(addr)) = connect_info {
            return addr.ip().to_string();
        }

        "127.0.0.1".to_string()
    }

    /// Checks if a client IP is allowed to proceed within a named bucket scope.
    pub async fn check_scoped_rate_limit(
        &self,
        scope: &str,
        client_ip: &str,
        max_requests: usize,
        window_ms: i64,
    ) -> bool {
        let now = chrono::Utc::now().timestamp_millis();
        let cutoff = now - window_ms;
        let key = format!("{}:{}", scope, client_ip);

        let mut map = self.history.lock().await;
        let entry = map.entry(key).or_default();

        // Evict expired entries
        entry.retain(|&ts| ts > cutoff);

        if entry.len() >= max_requests {
            false
        } else {
            entry.push(now);
            true
        }
    }

    /// Backwards-compatible helper for share endpoint rate limiting.
    pub async fn check_rate_limit(
        &self,
        client_ip: &str,
        max_requests: usize,
        window_ms: i64,
    ) -> bool {
        self.check_scoped_rate_limit("share", client_ip, max_requests, window_ms)
            .await
    }
}
