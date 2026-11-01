//! apps/relay-server/src/main.rs
//! VaultGuard (Arca by Pixra) Blind Relay Server Entrypoint.

mod auth;
mod crdt;
mod db;
mod rate_limit;
mod share;
mod sync;

use axum::{
    routing::{get, post},
    Json, Router,
};
use serde_json::json;
use std::net::SocketAddr;
use std::sync::Arc;
use tower_http::cors::{Any, CorsLayer};
use tower_http::trace::TraceLayer;
use tracing::info;

use crate::{
    db::Db,
    rate_limit::RateLimiter,
    share::{
        burn_share_handler, create_share_handler, get_share_handler, ShareState,
    },
    sync::{
        challenge_handler, delete_account_handler, delta_handler, push_handler,
        register_handler, verify_handler, AppState,
    },
};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // 1. Explicit Panic Hook so any panic is clearly visible in Render logs
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

    // 3. Database Path & Initialization
    let db_url = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "sqlite:///tmp/arca_relay.db".to_string());

    let trusted_proxy = std::env::var("TRUSTED_PROXY")
        .map(|v| v.to_lowercase() == "true" || v == "1")
        .unwrap_or(true);

    eprintln!("==================================================");
    eprintln!("Starting VaultGuard Blind Relay Server v0.4.1");
    eprintln!("Configured Database URL: {}", db_url);
    eprintln!("Trusted proxy mode: {}", trusted_proxy);
    eprintln!("==================================================");

    // Ensure /tmp directory exists with write permissions for SQLite
    if let Err(e) = std::fs::create_dir_all("/tmp") {
        eprintln!("Warning: Failed to ensure /tmp exists: {:?}", e);
    }

    let db = match Db::open(&db_url) {
        Ok(database) => {
            eprintln!("SQLite Database ready at {}", db_url);
            database
        }
        Err(e) => {
            eprintln!("FATAL: Failed to open or migrate database at {}: {:?}", db_url, e);
            return Err(e.into());
        }
    };

    let rate_limiter = RateLimiter::new();
    let app_state = Arc::new(AppState { db: db.clone() });
    let share_state = Arc::new(ShareState {
        db: db.clone(),
        rate_limiter,
        trusted_proxy,
    });

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let sync_routes = Router::new()
        .route("/v1/auth/register", post(register_handler))
        .route("/v1/auth/challenge", post(challenge_handler))
        .route("/v1/auth/verify", post(verify_handler))
        .route("/v1/sync/delta", get(delta_handler))
        .route("/v1/sync/push", post(push_handler))
        .route("/v1/account", axum::routing::delete(delete_account_handler))
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
                    "version": "0.4.1",
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
                    "version": "0.4.1"
                }))
            }),
        )
        .merge(sync_routes)
        .merge(share_routes)
        .layer(cors)
        .layer(TraceLayer::new_for_http());

    // 4. Dynamic Port Binding for Render
    let port = std::env::var("PORT").unwrap_or_else(|_| "8080".to_string());
    let addr = format!("0.0.0.0:{}", port);

    // 5. Explicit Panic / Startup Logs
    eprintln!("Server starting on {}", addr);
    info!("Binding TcpListener on {}", addr);

    let listener = match tokio::net::TcpListener::bind(&addr).await {
        Ok(l) => l,
        Err(e) => {
            eprintln!("FATAL: Failed to bind TcpListener to {}: {:?}", addr, e);
            return Err(e.into());
        }
    };

    eprintln!("Relay Server is actively listening and ready for requests on http://{}", addr);

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
