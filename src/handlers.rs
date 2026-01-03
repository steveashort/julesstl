use crate::{db, models::{IngestPayload, IncidentRecord, MetricRecord, TrafficLightState}, settings::{AppSettings}, AppState};
use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::Json,
};
use tracing::error;

pub async fn ingest(
    State(state): State<AppState>,
    Json(payload): Json<IngestPayload>,
) -> StatusCode {
    tracing::debug!("Received payload for {}/{}", payload.class, payload.tl);
    match state.tx.send(payload).await {
        Ok(_) => StatusCode::ACCEPTED,
        Err(e) => {
            error!("Failed to send payload to worker channel: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        }
    }
}

#[derive(serde::Deserialize)]
pub struct ReportQuery {
    pub hours: Option<u32>,
}

pub async fn get_top_offenders(
    State(app_state): State<AppState>,
    Query(params): Query<ReportQuery>,
) -> Result<Json<Vec<(String, String, String, f64)>>, StatusCode> {
    let hours = params.hours.unwrap_or(24);
    match db::get_top_offenders(app_state.pool, hours).await {
        Ok(offenders) => Ok(Json(offenders)),
        Err(e) => {
            eprintln!("Failed to fetch top offenders: {}", e);
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

pub async fn get_incidents(
    State(app_state): State<AppState>,
    Query(params): Query<ReportQuery>,
) -> Result<Json<Vec<IncidentRecord>>, StatusCode> {
    let hours = params.hours.unwrap_or(24);
    match db::get_incidents(app_state.pool, hours).await {
        Ok(incidents) => Ok(Json(incidents)),
        Err(e) => {
             eprintln!("Failed to fetch incidents: {}", e);
             Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

pub async fn get_settings(
    State(app_state): State<AppState>,
) -> Result<Json<AppSettings>, StatusCode> {
    let settings = app_state.settings.read().unwrap().clone();
    Ok(Json(settings))
}

pub async fn update_settings(
    State(app_state): State<AppState>,
    Json(payload): Json<AppSettings>,
) -> StatusCode {
    {
        let mut settings = app_state.settings.write().unwrap();
        *settings = payload;
    } 
    
    match crate::settings::save_settings(&app_state.settings.read().unwrap()) {
        Ok(_) => StatusCode::OK,
        Err(e) => {
            eprintln!("Failed to save settings: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        }
    }
}

pub async fn list_traffic_lights(
    State(app_state): State<AppState>,
) -> Result<Json<Vec<TrafficLightState>>, StatusCode> {
    match db::get_current_states(app_state.pool).await {
        Ok(tls) => Ok(Json(tls)),
        Err(e) => {
             eprintln!("Failed to fetch TLs: {}", e);
             Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

pub async fn get_history(
    State(app_state): State<AppState>,
    Path((class, group, tl)): Path<(String, String, String)>,
) -> Result<Json<Vec<TrafficLightState>>, StatusCode> {
    match db::get_history(app_state.pool, class, group, tl).await {
        Ok(tls) => Ok(Json(tls)),
        Err(e) => {
             eprintln!("Failed to fetch history: {}", e);
             Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

pub async fn get_metrics(
    State(app_state): State<AppState>,
    Path((class, group, tl)): Path<(String, String, String)>,
) -> Result<Json<Vec<MetricRecord>>, StatusCode> {
    match db::get_metrics(app_state.pool, class, group, tl).await {
        Ok(metrics) => Ok(Json(metrics)),
        Err(e) => {
             eprintln!("Failed to fetch metrics: {}", e);
             Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}
