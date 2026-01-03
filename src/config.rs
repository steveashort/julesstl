use serde::{Deserialize, Serialize};
use std::fs;
use anyhow::Result;

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct SystemLimits {
    pub max_expiration_minutes: u32,
    pub max_history_days: u32,
    pub max_history_records: u32,
}

impl Default for SystemLimits {
    fn default() -> Self {
        Self {
            max_expiration_minutes: 527040, // 366 days * 24 * 60
            max_history_days: 366,
            max_history_records: 50000,
        }
    }
}

pub fn load_config() -> Result<SystemLimits> {
    match fs::read_to_string("system_config.json") {
        Ok(content) => {
            let config: SystemLimits = serde_json::from_str(&content)?;
            Ok(config)
        },
        Err(_) => {
            let config = SystemLimits::default();
            // We write the default so the file exists for the user to edit
            let content = serde_json::to_string_pretty(&config)?;
            fs::write("system_config.json", content)?;
            Ok(config)
        }
    }
}
