//! apps/relay-server/src/main.rs
//! VaultGuard (Arca by Pixra) Blind Relay Server Entrypoint — PostgreSQL Edition (v0.5.0).
//! Enforces Zero-Knowledge Sync, Device Authorization, 5-Min Ephemeral Shares, Rate Limiting & Tamper-Proof Security Headers.

mod auth;
mod crdt;
mod db;
mod rate_limit;
mod share;
mod sync;

use axum::{
    extract::Request,
    http::{header, HeaderName, HeaderValue, Method},
    middleware::{self, Next},
    response::Response,
    routing::{get, post},
    Json, Router,
};
use serde_json::json;
use std::net::SocketAddr;
use std::sync::Arc;
use tower_http::cors::{AllowOrigin, Any, CorsLayer};
use tower_http::trace::TraceLayer;
use tracing::info;

use crate::{
    db::Db,
    rate_limit::RateLimiter,
    share::{burn_share_handler, create_share_handler, get_share_handler, ShareState},
    sync::{
        challenge_handler, delete_account_handler, delta_handler, device_approve_handler,
        device_list_handler, device_request_handler, device_revoke_handler, push_handler,
        register_handler, verify_handler, AppState,
    },
};

/// Middleware injecting strict, tamper-proof HTTP security headers (HSTS, CSP, X-Frame-Options, nosniff, no-store).
async fn security_headers_middleware(req: Request, next: Next) -> Response {
    let mut res = next.run(req).await;
    let headers = res.headers_mut();

    headers.insert(
        header::STRICT_TRANSPORT_SECURITY,
        HeaderValue::from_static("max-age=63072000; includeSubDomains; preload"),
    );
    headers.insert(
        header::CONTENT_SECURITY_POLICY,
        HeaderValue::from_static(
            "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
        ),
    );
    headers.insert(
        header::X_CONTENT_TYPE_OPTIONS,
        HeaderValue::from_static("nosniff"),
    );
    headers.insert(header::X_FRAME_OPTIONS, HeaderValue::from_static("DENY"));
    headers.insert(
        header::REFERRER_POLICY,
        HeaderValue::from_static("no-referrer"),
    );
    headers.insert(
        header::CACHE_CONTROL,
        HeaderValue::from_static("no-store, no-cache, must-revalidate"),
    );
    headers.insert(
        HeaderName::from_static("x-permitted-cross-domain-policies"),
        HeaderValue::from_static("none"),
    );

    res
}

fn build_cors_layer() -> CorsLayer {
    let allowed_methods = [Method::GET, Method::POST, Method::DELETE, Method::OPTIONS];
    let allowed_headers = [
        header::CONTENT_TYPE,
        HeaderName::from_static("x-vg-account-id"),
        HeaderName::from_static("x-vg-device-id"),
        HeaderName::from_static("x-vg-challenge-nonce"),
        HeaderName::from_static("x-vg-timestamp"),
        HeaderName::from_static("x-vg-body-sha256"),
        HeaderName::from_static("x-vg-signature"),
        HeaderName::from_static("x-vg-peek-only"),
    ];

    if let Ok(origins_str) = std::env::var("ALLOWED_ORIGINS") {
        let parsed: Vec<HeaderValue> = origins_str
            .split(',')
            .filter_map(|s| HeaderValue::from_str(s.trim()).ok())
            .collect();
        if !parsed.is_empty() {
            return CorsLayer::new()
                .allow_origin(AllowOrigin::list(parsed))
                .allow_methods(allowed_methods)
                .allow_headers(allowed_headers);
        }
    }

    // Default for browser extensions (chrome-extension://, moz-extension://) and mobile clients
    CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(allowed_methods)
        .allow_headers(allowed_headers)
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // 1. Explicit Panic Hook so any panic is clearly visible in logs
    std::panic::set_hook(Box::new(|info| {
        eprintln!("FATAL PANIC: {}", info);
    }));

    // 2. Tracing initialization (fail-open)
    let _ = tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info,vaultguard_relay_server=debug".into()),
        )
        .try_init();

    // 3. Read configuration from environment (Patch VG-02: default TRUSTED_PROXY to false unless explicitly enabled)
    let db_url = std::env::var("DATABASE_URL")
        .expect("DATABASE_URL must be set (e.g. postgres://user:password@host:5432/dbname)");

    let trusted_proxy = std::env::var("TRUSTED_PROXY")
        .map(|v| v.to_lowercase() == "true" || v == "1")
        .unwrap_or(false);

    eprintln!("==================================================");
    eprintln!("Starting VaultGuard Blind Relay Server v0.5.0");
    eprintln!("Database backend: PostgreSQL (Supabase)");
    eprintln!("Trusted proxy mode: {}", trusted_proxy);
    eprintln!("==================================================");

    // 4. PostgreSQL connection + automatic migrations
    let db = match Db::connect(&db_url).await {
        Ok(database) => {
            info!("PostgreSQL database connected and migrations applied.");
            database
        }
        Err(e) => {
            eprintln!(
                "FATAL: Failed to connect or migrate PostgreSQL database: {:?}",
                e
            );
            return Err(e.into());
        }
    };

    let rate_limiter = RateLimiter::new();
    let app_state = Arc::new(AppState {
        db: db.clone(),
        rate_limiter: rate_limiter.clone(),
        trusted_proxy,
    });
    let share_state = Arc::new(ShareState {
        db: db.clone(),
        rate_limiter,
        trusted_proxy,
    });

    let cors = build_cors_layer();

    let sync_routes = Router::new()
        .route("/v1/auth/register", post(register_handler))
        .route("/v1/auth/challenge", post(challenge_handler))
        .route("/v1/auth/verify", post(verify_handler))
        .route("/v1/device/request", post(device_request_handler))
        .route("/v1/device/approve", post(device_approve_handler))
        .route(
            "/v1/device/list",
            get(device_list_handler).post(device_list_handler),
        )
        .route("/v1/device/revoke", post(device_revoke_handler))
        .route("/v1/sync/delta", get(delta_handler))
        .route("/v1/sync/push", post(push_handler))
        .route(
            "/v1/account",
            axum::routing::delete(delete_account_handler),
        )
        .with_state(app_state);

    let share_routes = Router::new()
        .route("/v1/share/create", post(create_share_handler))
        .route("/v1/share/:id", get(get_share_handler))
        .route("/v1/share/:id/burn", post(burn_share_handler))
        .with_state(share_state);

    let app = Router::new()
        .route(
            "/",
            get(|| async {
                Json(json!({
                    "status": "ok",
                    "server": "vaultguard-relay-server",
                    "version": "0.5.0",
                    "service": "Arca by Pixra Blind Relay"
                }))
            }),
        )
        .route(
            "/health",
            get(|| async {
                Json(json!({
                    "status": "ok",
                    "server": "vaultguard-relay-server",
                    "version": "0.5.0"
                }))
            }),
        )
        .merge(sync_routes)
        .merge(share_routes)
        .layer(middleware::from_fn(security_headers_middleware))
        .layer(cors)
        .layer(TraceLayer::new_for_http());

    // 5. Dynamic Port Binding
    let port = std::env::var("PORT").unwrap_or_else(|_| "8080".to_string());
    let addr = format!("0.0.0.0:{}", port);

    info!("Binding TcpListener on {}", addr);

    let listener = match tokio::net::TcpListener::bind(&addr).await {
        Ok(l) => l,
        Err(e) => {
            eprintln!("FATAL: Failed to bind TcpListener to {}: {:?}", addr, e);
            return Err(e.into());
        }
    };

    eprintln!("Relay Server listening on http://{}", addr);

    if let Err(e) = axum::serve(
        listener,
        app.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .await
    {
        eprintln!("FATAL: Axum server crashed: {:?}", e);
        return Err(e.into());
    }

    Ok(())
}
