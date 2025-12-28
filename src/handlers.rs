use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::Json,
};
use crate::{db, models::{IngestPayload, TrafficLightState, MetricRecord, IncidentRecord}};
use serde_json::Value;

pub async fn ingest(
    State(pool): State<db::DbPool>,
    Json(payload): Json<IngestPayload>,
) -> StatusCode {
    let final_colour = if payload.colour == "inferred" {
        infer_colour(&payload)
    } else {
        payload.colour.clone()
    };

    match db::insert_traffic_light(pool, payload, final_colour).await {
        Ok(_) => StatusCode::CREATED,
        Err(e) => {
            eprintln!("Failed to ingest: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        }
    }
}

#[derive(serde::Deserialize)]
pub struct IncidentsQuery {
    hours: Option<u32>,
}

pub async fn get_incidents(
    State(pool): State<db::DbPool>,
    Query(params): Query<IncidentsQuery>,
) -> Result<Json<Vec<IncidentRecord>>, StatusCode> {
    let hours = params.hours.unwrap_or(24);
    match db::get_incidents(pool, hours).await {
        Ok(incidents) => Ok(Json(incidents)),
        Err(e) => {
             eprintln!("Failed to fetch incidents: {}", e);
             Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

fn check_matches(val_str: Option<&str>, val_num: Option<f64>, rules: Option<&Vec<String>>) -> bool {
    if let Some(rules) = rules {
        for rule in rules {
            if rule.contains(':') {
                if let Some(v) = val_num {
                    let parts: Vec<&str> = rule.split(':').collect();
                    if parts.len() == 2 {
                        if let (Ok(min), Ok(max)) = (parts[0].parse::<f64>(), parts[1].parse::<f64>()) {
                            if v >= min && v < max {
                                return true;
                            }
                        }
                    }
                }
            } else {
                if let Some(s) = val_str {
                    if s == rule {
                        return true;
                    }
                }
                if let Some(v) = val_num {
                    if let Ok(rv) = rule.parse::<f64>() {
                        if (v - rv).abs() < f64::EPSILON {
                            return true;
                        }
                    }
                }
            }
        }
    }
    false
}

fn infer_colour(payload: &IngestPayload) -> String {
    let mut has_red = false;
    let mut has_yellow = false;

    if let Some(data) = &payload.data {
        for (_, metric) in data {
            let (val_num, val_str_owned) = match &metric.value {
                Value::Number(n) => (n.as_f64(), None),
                Value::String(s) => (None, Some(s.clone())),
                _ => (None, None),
            };
            let val_str = val_str_owned.as_deref();

            // Check Yellow first (Precedence)
            if check_matches(val_str, val_num, metric.yellow_if.as_ref()) {
                has_yellow = true;
                continue;
            }

            // Check Green
            if check_matches(val_str, val_num, metric.green_if.as_ref()) {
                continue;
            }

            // Neither -> Red
            has_red = true;
        }
    }

    if has_red {
        "red".to_string()
    } else if has_yellow {
        "yellow".to_string()
    } else {
        "green".to_string()
    }
}

pub async fn list_traffic_lights(
    State(pool): State<db::DbPool>,
) -> Result<Json<Vec<TrafficLightState>>, StatusCode> {
    match db::get_current_states(pool).await {
        Ok(tls) => Ok(Json(tls)),
        Err(e) => {
             eprintln!("Failed to fetch TLs: {}", e);
             Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

pub async fn get_history(
    State(pool): State<db::DbPool>,
    Path((class, group, tl)): Path<(String, String, String)>,
) -> Result<Json<Vec<TrafficLightState>>, StatusCode> {
    match db::get_history(pool, class, group, tl).await {
        Ok(tls) => Ok(Json(tls)),
        Err(e) => {
             eprintln!("Failed to fetch history: {}", e);
             Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

pub async fn get_metrics(
    State(pool): State<db::DbPool>,
    Path((class, group, tl)): Path<(String, String, String)>,
) -> Result<Json<Vec<MetricRecord>>, StatusCode> {
    match db::get_metrics(pool, class, group, tl).await {
        Ok(metrics) => Ok(Json(metrics)),
        Err(e) => {
             eprintln!("Failed to fetch metrics: {}", e);
             Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{IngestPayload, MetricData};
    use std::collections::HashMap;
    use serde_json::json;

    #[test]
    fn test_infer_colour_green() {
        let mut data = HashMap::new();
        data.insert("load".to_string(), MetricData {
            key: "load".to_string(),
            value: json!(0.5),
            metric_type: "gauge".to_string(),
            unit: None,
            green_if: Some(vec!["0:1.0".to_string()]),
            yellow_if: None,
        });

        let payload = IngestPayload {
            class: "test".to_string(),
            group: "default".to_string(),
            tl: "t1".to_string(),
            colour: "inferred".to_string(),
            expires_at: None,
            description: None,
            data: Some(data),
            timestamp: "2023-01-01T00:00:00Z".to_string(),
            tags: None,
        };

        assert_eq!(infer_colour(&payload), "green");
    }

    #[test]
    fn test_infer_colour_yellow_overlap() {
        let mut data = HashMap::new();
        data.insert("load".to_string(), MetricData {
            key: "load".to_string(),
            value: json!(1.5),
            metric_type: "gauge".to_string(),
            unit: None,
            green_if: Some(vec!["0:2.0".to_string()]),
            yellow_if: Some(vec!["1.0:2.0".to_string()]), // Overlap
        });

        let payload = IngestPayload {
            class: "test".to_string(),
            group: "default".to_string(),
            tl: "t1".to_string(),
            colour: "inferred".to_string(),
            expires_at: None,
            description: None,
            data: Some(data),
            timestamp: "2023-01-01T00:00:00Z".to_string(),
            tags: None,
        };

        assert_eq!(infer_colour(&payload), "yellow");
    }

    #[test]
    fn test_infer_colour_red_outside() {
        let mut data = HashMap::new();
        data.insert("load".to_string(), MetricData {
            key: "load".to_string(),
            value: json!(2.5),
            metric_type: "gauge".to_string(),
            unit: None,
            green_if: Some(vec!["0:1.0".to_string()]),
            yellow_if: Some(vec!["1.0:2.0".to_string()]),
        });

        let payload = IngestPayload {
            class: "test".to_string(),
            group: "default".to_string(),
            tl: "t1".to_string(),
            colour: "inferred".to_string(),
            expires_at: None,
            description: None,
            data: Some(data),
            timestamp: "2023-01-01T00:00:00Z".to_string(),
            tags: None,
        };

        assert_eq!(infer_colour(&payload), "red");
    }
}