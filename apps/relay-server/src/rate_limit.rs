//! apps/relay-server/src/rate_limit.rs
//! In-memory IP rate limiter for POST /v1/share/create (5 requests / minute, Patch VG-02).

use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;

#[derive(Clone, Default)]
pub struct RateLimiter {
    // ip -> timestamps (in ms)
    history: Arc<Mutex<HashMap<String, Vec<i64>>>>,
}

impl RateLimiter {
    pub fn new() -> Self {
        Self {
            history: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Checks if a client IP is allowed to proceed (5 req / 60 seconds).
    pub async fn check_rate_limit(&self, client_ip: &str, max_requests: usize, window_ms: i64) -> bool {
        let now = chrono::Utc::now().timestamp_millis();
        let cutoff = now - window_ms;

        let mut map = self.history.lock().await;
        let entry = map.entry(client_ip.to_string()).or_default();

        // Evict expired entries
        entry.retain(|&ts| ts > cutoff);

        if entry.len() >= max_requests {
            false
        } else {
            entry.push(now);
            true
        }
    }
}
