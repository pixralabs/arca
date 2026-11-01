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
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info,vaultguard_relay_server=debug".into()),
        )
        .init();

    let port: u16 = std::env::var("PORT")
        .unwrap_or_else(|_| "8080".into())
        .parse()
        .expect("PORT must be a valid integer");

    let database_url = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "sqlite:///tmp/arca_relay.db".into());

    let trusted_proxy = std::env::var("TRUSTED_PROXY")
        .map(|v| v.to_lowercase() == "true" || v == "1")
        .unwrap_or(true);

    info!("Starting VaultGuard Blind Relay Server v0.4.1");
    info!("Database URL: {}", database_url);
    info!("Trusted proxy mode: {}", trusted_proxy);

    let db = Db::open(&database_url)?;
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

    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    info!("Listening on http://{}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .await?;

    Ok(())
}
