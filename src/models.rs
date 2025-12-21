use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct IngestPayload {
    pub class: String,
    pub tl: String,
    pub colour: String, // "green", "yellow", "red", "inferred"
    pub expires_at: Option<String>, // Or DateTime<Utc>
    pub description: Option<String>,
    pub data: Option<HashMap<String, MetricData>>,
    pub timestamp: String, // Or DateTime<Utc>
    pub tags: Option<Vec<String>>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct MetricData {
    pub key: String,
    pub value: serde_json::Value, // Can be string or number
    #[serde(rename = "type")]
    pub metric_type: String, // "enum", "gauge"
    pub unit: Option<String>,
    #[serde(rename = "green if")]
    pub green_if: Option<Vec<String>>,
    #[serde(rename = "yellow if")]
    pub yellow_if: Option<Vec<String>>,
    #[serde(rename = "yellow at")]
    pub yellow_at: Option<f64>,
    #[serde(rename = "red at")]
    pub red_at: Option<f64>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct TrafficLightState {
    pub class: String,
    pub tl: String,
    pub colour: String,
    pub timestamp: String,
    pub expires_at: Option<String>,
    pub description: Option<String>,
    pub tags: Vec<String>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct MetricRecord {
    pub class: String,
    pub tl: String,
    pub timestamp: String,
    pub key: String,
    pub value: f64, // For gauges
    pub value_str: Option<String>, // For enums
    pub metric_type: String,
    pub unit: Option<String>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct IncidentRecord {
    pub class: String,
    pub tl: String,
    pub colour: String,
    pub start_time: String,
    pub duration_seconds: f64,
    pub description: Option<String>,
}
