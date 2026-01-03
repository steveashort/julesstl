use axum::{
    routing::{get, post},
    Router, http::StatusCode,
};
use crate::models::IngestPayload;
use std::net::SocketAddr;
use std::sync::{Arc, RwLock};
use tokio::sync::mpsc;
use tower_http::cors::CorsLayer;
use tower_http::services::ServeDir;
use tracing::info;

mod db;
mod handlers;
mod models;
mod settings;
mod config;

#[derive(Clone)]
pub struct AppState {
    pool: db::DbPool,
    tx: mpsc::Sender<IngestPayload>,
    settings: settings::SettingsHandle,
    config: Arc<config::SystemLimits>,
}

async fn health_check() -> StatusCode {
    StatusCode::OK
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt::init();
    info!("Starting server...");

    info!("Initializing database pool...");
    let pool = db::init_pool()?;
    info!("Database pool initialized.");

    info!("Loading settings...");
    let app_settings = settings::load_settings()?;
    let settings_handle = Arc::new(RwLock::new(app_settings));
    info!("Settings loaded.");

    info!("Loading system config...");
    let system_config = Arc::new(config::load_config()?);
    info!("System config loaded.");

    let (tx, mut rx) = mpsc::channel::<IngestPayload>(10_000);

    let app_state = AppState {
        pool: pool.clone(),
        tx,
        settings: settings_handle.clone(),
        config: system_config.clone(),
    };

    info!("Spawning background worker for batch processing...");
    let worker_pool = pool.clone();
    let worker_settings = settings_handle.clone();
    tokio::spawn(async move {
        let mut buffer = Vec::with_capacity(100);
        let batch_size = 100;
        let batch_timeout = std::time::Duration::from_millis(500);

        loop {
            let timeout = tokio::time::sleep(batch_timeout);
            tokio::pin!(timeout);
            tokio::select! {
                Some(payload) = rx.recv() => {
                    tracing::debug!("Worker received payload: {}/{}", payload.class, payload.tl);
                    buffer.push(payload);
                    if buffer.len() >= batch_size {
                        info!("Buffer full, inserting batch of {}", buffer.len());
                        if let Err(e) = db::insert_batch(worker_pool.clone(), buffer.drain(..).collect(), worker_settings.clone()).await {
                            tracing::error!("Failed to insert batch: {}", e);
                        }
                    }
                }
                _ = &mut timeout => {
                    if !buffer.is_empty() {
                        info!("Timeout reached, inserting batch of {}", buffer.len());
                        if let Err(e) = db::insert_batch(worker_pool.clone(), buffer.drain(..).collect(), worker_settings.clone()).await {
                            tracing::error!("Failed to insert batch (timeout): {}", e);
                        }
                    }
                }
            }
        }
    });
    info!("Background worker spawned.");

    let ingest_app = Router::new()
        .route("/", post(handlers::ingest))
        .with_state(app_state.clone())
        .layer(CorsLayer::permissive());

    let api_routes = Router::new()
        .route("/health", get(health_check))
        .route("/traffic-lights", get(handlers::list_traffic_lights))
        .route("/traffic-lights/:class/:group/:tl/history", get(handlers::get_history))
        .route("/traffic-lights/:class/:group/:tl/metrics", get(handlers::get_metrics))
        .route("/reports/incidents", get(handlers::get_incidents))
        .route("/reports/top-offenders", get(handlers::get_top_offenders))
        .route("/settings", get(handlers::get_settings).post(handlers::update_settings))
        .route("/system-config", get(handlers::get_system_config))
        .with_state(app_state.clone());

    let ui_app = Router::new()
        .nest("/api", api_routes)
        .nest_service("/", ServeDir::new("frontend/dist"))
        .layer(CorsLayer::permissive());

    let addr_ingest = SocketAddr::from(([0, 0, 0, 0], 9000));
    let addr_ui = SocketAddr::from(([0, 0, 0, 0], 9001));

    info!("Spawning housekeeping task...");
    let housekeeping_pool = pool.clone();
    let housekeeping_settings = settings_handle.clone();
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(std::time::Duration::from_secs(60));
        loop {
            interval.tick().await;
            if let Err(e) = db::run_housekeeping(housekeeping_pool.clone(), housekeeping_settings.clone()).await {
                tracing::error!("Housekeeping failed: {}", e);
            }
        }
    });
    info!("Housekeeping task spawned.");

    info!("Binding to addresses and starting servers...");
    let server_ingest = axum::serve(tokio::net::TcpListener::bind(addr_ingest).await?, ingest_app);
    let server_ui = axum::serve(tokio::net::TcpListener::bind(addr_ui).await?, ui_app);
    
    println!("Ingestion listening on {}", addr_ingest);
    println!("UI listening on {}", addr_ui);

    let _ = tokio::join!(server_ingest, server_ui);

    Ok(())
}
