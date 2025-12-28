use axum::{
    routing::{get, post},
    Router,
};
use std::net::SocketAddr;
use tower_http::cors::CorsLayer;
use tower_http::services::ServeDir;

mod db;
mod handlers;
mod models;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt::init();

    let pool = db::init_pool()?;

    // Ingestion App (Port 9000)
    let ingest_app = Router::new()
        .route("/", post(handlers::ingest)) // The prompt says ingest endpoint. Usually / or /ingest.
        // Prompt says "ingest data JSON payloads sent to a localhost:3000 endpoint".
        // It doesn't specify path. I'll support root POST.
        .with_state(pool.clone());

    // UI/API App (Port 9001)
    let api_routes = Router::new()
        .route("/traffic-lights", get(handlers::list_traffic_lights))
        .route("/traffic-lights/:class/:group/:tl/history", get(handlers::get_history))
        .route("/traffic-lights/:class/:group/:tl/metrics", get(handlers::get_metrics))
        .route("/reports/incidents", get(handlers::get_incidents))
        .with_state(pool.clone());

    let ui_app = Router::new()
        .nest("/api", api_routes)
        .nest_service("/", ServeDir::new("frontend/dist"))
        .layer(CorsLayer::permissive());

    let addr_ingest = SocketAddr::from(([0, 0, 0, 0], 9000));
    let addr_ui = SocketAddr::from(([0, 0, 0, 0], 9001));

    println!("Ingestion listening on {}", addr_ingest);
    println!("UI listening on {}", addr_ui);

    // Spawn housekeeping task
    let housekeeping_pool = pool.clone();
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(10));
        loop {
            interval.tick().await;
            if let Err(e) = db::check_and_update_expirations(housekeeping_pool.clone()).await {
                eprintln!("Housekeeping error: {}", e);
            }
        }
    });

    let server_ingest = axum::serve(
        tokio::net::TcpListener::bind(addr_ingest).await?,
        ingest_app,
    );

    let server_ui = axum::serve(
        tokio::net::TcpListener::bind(addr_ui).await?,
        ui_app,
    );

    let _ = tokio::join!(server_ingest, server_ui);

    Ok(())
}
