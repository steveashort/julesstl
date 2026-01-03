use serde::{Deserialize, Serialize};
use std::fs;
use std::sync::{Arc, RwLock};
use anyhow::Result;

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct AppSettings {
    pub history_purge_max_records: u32,
    pub history_purge_max_days: u32,
    pub default_expiration_minutes: u32,
    pub purple_to_yellow_minutes: u32,
    pub purple_to_red_minutes: u32,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            history_purge_max_records: 10000,
            history_purge_max_days: 30,
            default_expiration_minutes: 60,
            purple_to_yellow_minutes: 1440, // 1 day
            purple_to_red_minutes: 4320,   // 3 days
        }
    }
}

pub fn load_settings() -> Result<AppSettings> {
    match fs::read_to_string("settings.json") {
        Ok(content) => {
            let settings: AppSettings = serde_json::from_str(&content)?;
            Ok(settings)
        },
        Err(_) => {
            // If file doesn't exist, create it with defaults
            let settings = AppSettings::default();
            save_settings(&settings)?;
            Ok(settings)
        }
    }
}

pub fn save_settings(settings: &AppSettings) -> Result<()> {
    let content = serde_json::to_string_pretty(settings)?;
    fs::write("settings.json", content)?;
    Ok(())
}

pub type SettingsHandle = Arc<RwLock<AppSettings>>;
