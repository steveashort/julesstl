use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::Json,
};
use crate::{db, models::{IngestPayload, TrafficLightState, MetricRecord}};
use std::sync::Arc;
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

fn infer_colour(payload: &IngestPayload) -> String {
    let mut is_red = false;
    let mut is_yellow = false;

    if let Some(data) = &payload.data {
        for (_, metric) in data {
            // Logic for Enum
            if metric.metric_type == "enum" {
                if let Value::String(val) = &metric.value {
                    if let Some(green_if) = &metric.green_if {
                        if !green_if.contains(val) {
                            // Not green, check yellow
                            if let Some(yellow_if) = &metric.yellow_if {
                                if yellow_if.contains(val) {
                                    is_yellow = true;
                                } else {
                                    // If not green and not yellow (and not specified), assume red?
                                    // Or maybe default to red if explicitly not green/yellow?
                                    // Based on prompt, usually if something is wrong it goes yellow or red.
                                    // If strict, assume Red if not matched.
                                    // Let's assume Red if not in green or yellow list.
                                    is_red = true;
                                }
                            } else {
                                // Not green, no yellow rules -> Red
                                is_red = true;
                            }
                        }
                    }
                }
            }
            // Logic for Gauge
            else if metric.metric_type == "gauge" {
                if let Value::Number(val) = &metric.value {
                    if let Some(v) = val.as_f64() {
                        if let Some(red_at) = metric.red_at {
                             // Assuming higher is worse for now based on CPU example.
                             // But what if lower is worse? Usually "at" implies a threshold.
                             // Example: red at 90. value 73. 73 < 90.
                             // Example: yellow at 70. 73 > 70.
                             // So if v >= red_at -> Red.
                             if v >= red_at {
                                 is_red = true;
                             }
                        }
                        if let Some(yellow_at) = metric.yellow_at {
                            if v >= yellow_at {
                                is_yellow = true;
                            }
                        }
                    }
                }
            }
        }
    }

    if is_red {
        "red".to_string()
    } else if is_yellow {
        "yellow".to_string()
    } else {
        "green".to_string()
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
            green_if: None,
            yellow_if: None,
            yellow_at: Some(1.0),
            red_at: Some(2.0),
        });

        let payload = IngestPayload {
            class: "test".to_string(),
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
    fn test_infer_colour_yellow() {
        let mut data = HashMap::new();
        data.insert("load".to_string(), MetricData {
            key: "load".to_string(),
            value: json!(1.5),
            metric_type: "gauge".to_string(),
            unit: None,
            green_if: None,
            yellow_if: None,
            yellow_at: Some(1.0),
            red_at: Some(2.0),
        });

        let payload = IngestPayload {
            class: "test".to_string(),
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
    fn test_infer_colour_red() {
        let mut data = HashMap::new();
        data.insert("load".to_string(), MetricData {
            key: "load".to_string(),
            value: json!(2.5),
            metric_type: "gauge".to_string(),
            unit: None,
            green_if: None,
            yellow_if: None,
            yellow_at: Some(1.0),
            red_at: Some(2.0),
        });

        let payload = IngestPayload {
            class: "test".to_string(),
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
    Path((class, tl)): Path<(String, String)>,
) -> Result<Json<Vec<TrafficLightState>>, StatusCode> {
    match db::get_history(pool, class, tl).await {
        Ok(tls) => Ok(Json(tls)),
        Err(e) => {
             eprintln!("Failed to fetch history: {}", e);
             Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

pub async fn get_metrics(
    State(pool): State<db::DbPool>,
    Path((class, tl)): Path<(String, String)>,
) -> Result<Json<Vec<MetricRecord>>, StatusCode> {
    match db::get_metrics(pool, class, tl).await {
        Ok(metrics) => Ok(Json(metrics)),
        Err(e) => {
             eprintln!("Failed to fetch metrics: {}", e);
             Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}
