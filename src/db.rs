use crate::{models::{IngestPayload, IncidentRecord, MetricRecord, TrafficLightState}, settings::{AppSettings, SettingsHandle}};
use anyhow::Result;
use duckdb::{params, Connection};
use serde_json::Value;
use std::sync::{Arc, Mutex};
use tokio::task;
use tracing::info;

pub type DbPool = Arc<Mutex<Connection>>;

pub fn init_pool() -> Result<DbPool> {
    let path = "traffic_lights.db".to_string(); 
    
    info!("Initializing connection to {}...", path);
    let conn = Connection::open(&path)?;
    
    info!("Initializing schema...");
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS traffic_lights (
            class VARCHAR,
            group_name VARCHAR,
            tl VARCHAR,
            colour VARCHAR,
            timestamp VARCHAR,
            expires_at VARCHAR,
            description VARCHAR,
            tags VARCHAR,
            PRIMARY KEY (class, group_name, tl, timestamp)
        );
        CREATE TABLE IF NOT EXISTS metrics (
            class VARCHAR,
            group_name VARCHAR,
            tl VARCHAR,
            timestamp VARCHAR,
            key VARCHAR,
            value DOUBLE,
            value_str VARCHAR,
            metric_type VARCHAR,
            unit VARCHAR,
            green_if VARCHAR,
            yellow_if VARCHAR
        );
        "#,
    )?;
    info!("Schema initialized.");

    Ok(Arc::new(Mutex::new(conn)))
}

fn check_matches(val_str: Option<&str>, val_num: Option<f64>, rules: Option<&Vec<String>>) -> bool {
    if let Some(rules) = rules {
        for rule in rules {
            if rule.contains(':') {
                if let Some(v) = val_num {
                    let parts: Vec<&str> = rule.split(':').collect();
                    if parts.len() == 2 {
                        if let (Ok(min), Ok(max)) = (parts[0].parse::<f64>(), parts[1].parse::<f64>()) {
                            if v >= min && v < max { return true; }
                        }
                    }
                }
            } else {
                if let Some(s) = val_str { if s == rule { return true; } }
                if let Some(v) = val_num {
                    if let Ok(rv) = rule.parse::<f64>() {
                        if (v - rv).abs() < f64::EPSILON { return true; }
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
            if check_matches(val_str, val_num, metric.yellow_if.as_ref()) {
                has_yellow = true;
                continue;
            }
            if check_matches(val_str, val_num, metric.green_if.as_ref()) {
                continue;
            }
            has_red = true;
        }
    }
    if has_red { "red".to_string() } else if has_yellow { "yellow".to_string() } else { "green".to_string() }
}

pub async fn insert_batch(pool: DbPool, payloads: Vec<IngestPayload>, settings_handle: SettingsHandle) -> Result<()> {
    task::spawn_blocking(move || {
        info!("DB worker processing batch of {} payloads.", payloads.len());
        let mut conn = pool.lock().map_err(|e| anyhow::anyhow!("Mutex lock failed: {}", e))?;
        let tx = conn.transaction()?;
        for mut payload in payloads {
            let final_colour = if payload.colour == "inferred" { infer_colour(&payload) } else { payload.colour.clone() };
            if payload.expires_at.is_none() {
                let settings = settings_handle.read().unwrap();
                let expiration = chrono::Utc::now() + chrono::Duration::minutes(settings.default_expiration_minutes as i64);
                payload.expires_at = Some(expiration.to_rfc3339_opts(chrono::SecondsFormat::Secs, true).to_string());
            }
            let tags_json = serde_json::to_string(&payload.tags.unwrap_or_default())?;
            tx.execute("INSERT INTO traffic_lights (class, group_name, tl, colour, timestamp, expires_at, description, tags) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", params![payload.class, payload.group, payload.tl, final_colour, payload.timestamp, payload.expires_at, payload.description, tags_json])?;
            if let Some(data) = payload.data {
                let mut appender = tx.appender("metrics")?;
                for (_key, metric) in data {
                    let (val_num, val_str) = match &metric.value {
                        Value::Number(n) => (n.as_f64(), None),
                        Value::String(s) => (None, Some(s.clone())),
                        _ => (None, None),
                    };
                    let green_if_json = metric.green_if.as_ref().map(|v| serde_json::to_string(v).unwrap_or_default());
                    let yellow_if_json = metric.yellow_if.as_ref().map(|v| serde_json::to_string(v).unwrap_or_default());
                    appender.append_row(params![payload.class, payload.group, payload.tl, payload.timestamp, metric.key, val_num, val_str, metric.metric_type, metric.unit, green_if_json, yellow_if_json])?;
                }
            }
        }
        tx.commit()?;
        Ok::<_, anyhow::Error>(())
    }).await??;
    Ok(())
}

pub async fn run_housekeeping(pool: DbPool, settings_handle: SettingsHandle) -> Result<()> {
    info!("Starting housekeeping run...");
    let settings = { settings_handle.read().unwrap().clone() };
    let (exp, purple, yellow, purge) = tokio::try_join!(
        check_and_update_expirations(pool.clone(), settings.clone()),
        check_and_escalate_purple(pool.clone(), settings.clone()),
        check_and_escalate_yellow(pool.clone(), settings.clone()),
        purge_old_history(pool.clone(), settings.clone())
    )?;
    if exp > 0 { info!("Housekeeping: Expired {} traffic lights.", exp); }
    if purple > 0 { info!("Housekeeping: Escalated {} purple traffic lights.", purple); }
    if yellow > 0 { info!("Housekeeping: Escalated {} yellow traffic lights.", yellow); }
    if purge > 0 { info!("Housekeeping: Purged {} old records.", purge); }
    info!("Housekeeping run finished.");
    Ok(())
}

async fn check_and_update_expirations(pool: DbPool, _settings: AppSettings) -> Result<usize> {
    task::spawn_blocking(move || {
        let conn = pool.lock().map_err(|e| anyhow::anyhow!("Mutex lock failed: {}", e))?;
        let mut stmt = conn.prepare(r#"WITH ranked_tls AS (SELECT *, ROW_NUMBER() OVER (PARTITION BY class, group_name, tl ORDER BY timestamp DESC) as rn FROM traffic_lights) SELECT class, group_name, tl, expires_at, tags FROM ranked_tls WHERE rn = 1 AND colour != 'purple' AND expires_at IS NOT NULL"#)?;
        let tls_to_update: Vec<(String, String, String, String, String)> = stmt.query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?)))?.filter_map(|r| r.ok()).collect();
        let now = chrono::Utc::now();
        let mut update_count = 0;
        for (class, group, tl, expires_at_str, tags_json) in tls_to_update {
            if let Ok(expires_at) = chrono::DateTime::parse_from_rfc3339(&expires_at_str) {
                if expires_at.with_timezone(&chrono::Utc) < now {
                    update_count += 1;
                    conn.execute("INSERT INTO traffic_lights (class, group_name, tl, colour, timestamp, expires_at, description, tags) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", params![class, group, tl, "purple", now.to_rfc3339_opts(chrono::SecondsFormat::Secs, true).to_string(), None::<String>, "Expired (Automatic Housekeeping)", tags_json])?;
                }
            }
        }
        Ok(update_count)
    }).await?
}

async fn check_and_escalate_purple(pool: DbPool, settings: AppSettings) -> Result<usize> {
     task::spawn_blocking(move || {
        let conn = pool.lock().map_err(|e| anyhow::anyhow!("Mutex lock failed: {}", e))?;
        let yellow_cutoff = chrono::Utc::now() - chrono::Duration::minutes(settings.purple_to_yellow_minutes as i64);
        let red_cutoff = chrono::Utc::now() - chrono::Duration::minutes(settings.purple_to_red_minutes as i64);
        let mut stmt = conn.prepare(r#"WITH ranked_tls AS (SELECT *, ROW_NUMBER() OVER (PARTITION BY class, group_name, tl ORDER BY timestamp DESC) as rn FROM traffic_lights) SELECT class, group_name, tl, timestamp, tags FROM ranked_tls WHERE rn = 1 AND colour = 'purple'"#)?;
        let purple_tls: Vec<(String, String, String, String, String)> = stmt.query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?)))?.filter_map(|r| r.ok()).collect();
        let mut escalation_count = 0;
        for (class, group, tl, timestamp_str, tags_json) in purple_tls {
            if let Ok(timestamp) = chrono::DateTime::parse_from_rfc3339(&timestamp_str) {
                let timestamp_utc = timestamp.with_timezone(&chrono::Utc);
                let new_colour = if timestamp_utc < red_cutoff { Some("red") } else if timestamp_utc < yellow_cutoff { Some("yellow") } else { None };
                if let Some(colour) = new_colour {
                    escalation_count += 1;
                    conn.execute("INSERT INTO traffic_lights (class, group_name, tl, colour, timestamp, expires_at, description, tags) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", params![class, group, tl, colour, chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true).to_string(), None::<String>, "Escalated from Purple (Automatic Housekeeping)", tags_json])?;
                }
            }
        }
        Ok(escalation_count)
    }).await?
}

async fn check_and_escalate_yellow(pool: DbPool, settings: AppSettings) -> Result<usize> {
     task::spawn_blocking(move || {
        if settings.yellow_to_red_minutes == 0 { return Ok(0); }
        let conn = pool.lock().map_err(|e| anyhow::anyhow!("Mutex lock failed: {}", e))?;
        let red_cutoff = chrono::Utc::now() - chrono::Duration::minutes(settings.yellow_to_red_minutes as i64);
        let mut stmt = conn.prepare(r#"WITH ranked_tls AS (SELECT *, ROW_NUMBER() OVER (PARTITION BY class, group_name, tl ORDER BY timestamp DESC) as rn FROM traffic_lights) SELECT class, group_name, tl, timestamp, tags FROM ranked_tls WHERE rn = 1 AND colour = 'yellow'"#)?;
        let yellow_tls: Vec<(String, String, String, String, String)> = stmt.query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?)))?.filter_map(|r| r.ok()).collect();
        let mut escalation_count = 0;
        for (class, group, tl, timestamp_str, tags_json) in yellow_tls {
            if let Ok(timestamp) = chrono::DateTime::parse_from_rfc3339(&timestamp_str) {
                let timestamp_utc = timestamp.with_timezone(&chrono::Utc);
                if timestamp_utc < red_cutoff {
                    escalation_count += 1;
                    conn.execute("INSERT INTO traffic_lights (class, group_name, tl, colour, timestamp, expires_at, description, tags) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", params![class, group, tl, "red", chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true).to_string(), None::<String>, "Escalated from Yellow (Automatic Housekeeping)", tags_json])?;
                }
            }
        }
        Ok(escalation_count)
    }).await?
}

async fn purge_old_history(pool: DbPool, settings: AppSettings) -> Result<usize> {
    task::spawn_blocking(move || {
        let conn = pool.lock().map_err(|e| anyhow::anyhow!("Mutex lock failed: {}", e))?;
        let cutoff_date = chrono::Utc::now() - chrono::Duration::days(settings.history_purge_max_days as i64);
        let cutoff_str = cutoff_date.to_rfc3339_opts(chrono::SecondsFormat::Secs, true).to_string();
        let date_deleted = conn.execute("DELETE FROM traffic_lights WHERE try_strptime(timestamp, ['%Y-%m-%dT%H:%M:%S.%fZ', '%Y-%m-%dT%H:%M:%SZ']) < ?", params![cutoff_str])?;
        conn.execute("DELETE FROM metrics WHERE try_strptime(timestamp, ['%Y-%m-%dT%H:%M:%S.%fZ', '%Y-%m-%dT%H:%M:%SZ']) < ?", params![cutoff_str])?;
        let mut stmt = conn.prepare("SELECT class, group_name, tl FROM traffic_lights GROUP BY class, group_name, tl HAVING count(*) > ?")?;
        let tls_to_trim: Vec<(String, String, String)> = stmt.query_map(params![settings.history_purge_max_records], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))?.filter_map(|r| r.ok()).collect();
        let mut count_deleted = 0;
        for (class, group, tl) in tls_to_trim {
            let mut count_stmt = conn.prepare("SELECT count(*) FROM traffic_lights WHERE class = ? AND group_name = ? AND tl = ?")?;
            let total_records: u32 = count_stmt.query_row(params![&class, &group, &tl], |row| row.get(0))?;
            if total_records > settings.history_purge_max_records {
                let limit = total_records - settings.history_purge_max_records;
                count_deleted += conn.execute("DELETE FROM traffic_lights WHERE (class, group_name, tl, timestamp) IN (SELECT class, group_name, tl, timestamp FROM traffic_lights WHERE class = ? AND group_name = ? AND tl = ? ORDER BY timestamp ASC LIMIT ?)", params![&class, &group, &tl, limit])?;
            }
        }
        Ok(date_deleted + count_deleted)
    }).await?
}

pub async fn get_top_offenders(pool: DbPool, hours: u32) -> Result<Vec<(String, String, String, f64)>> {
    let cutoff = chrono::Utc::now() - chrono::Duration::hours(hours as i64);
    let cutoff_str = cutoff.to_rfc3339_opts(chrono::SecondsFormat::Secs, true).to_string();
    task::spawn_blocking(move || {
        let conn = pool.lock().map_err(|e| anyhow::anyhow!("Mutex lock failed: {}", e))?;
        let mut stmt = conn.prepare(r#"WITH state_durations AS (SELECT class, group_name, tl, colour, timestamp, LEAD(timestamp, 1, strftime(CAST(now() AS TIMESTAMP), '%Y-%m-%dT%H:%M:%SZ')) OVER (PARTITION BY class, group_name, tl ORDER BY timestamp) as next_timestamp FROM traffic_lights WHERE timestamp >= ?), red_durations AS (SELECT class, group_name, tl, epoch_ms(try_strptime(next_timestamp, ['%Y-%m-%dT%H:%M:%S.%fZ', '%Y-%m-%dT%H:%M:%SZ'])) - epoch_ms(try_strptime(timestamp, ['%Y-%m-%dT%H:%M:%S.%fZ', '%Y-%m-%dT%H:%M:%SZ'])) as duration_ms FROM state_durations WHERE colour = 'red') SELECT class, group_name, tl, sum(duration_ms) / 1000.0 as total_red_seconds FROM red_durations GROUP BY class, group_name, tl ORDER BY total_red_seconds DESC LIMIT 10;"#)?;
        let offenders_iter = stmt.query_map(params![cutoff_str], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)))?;
        let mut offenders = Vec::new();
        for item in offenders_iter { offenders.push(item?); }
        Ok(offenders)
    }).await?
}

pub async fn get_incidents(pool: DbPool, hours: u32) -> Result<Vec<IncidentRecord>> {
    let cutoff = chrono::Utc::now() - chrono::Duration::hours(hours as i64);
    let cutoff_str = cutoff.to_rfc3339_opts(chrono::SecondsFormat::Secs, true).to_string();
    task::spawn_blocking(move || {
        let conn = pool.lock().map_err(|e| anyhow::anyhow!("Mutex lock failed: {}", e))?;
        let mut stmt = conn.prepare(r#"SELECT class, group_name, tl, colour, timestamp, description FROM traffic_lights WHERE timestamp >= ? ORDER BY class, group_name, tl, timestamp ASC"#)?;
        struct RawRow { class: String, group: String, tl: String, colour: String, timestamp: String, description: Option<String> }
        let rows_iter = stmt.query_map(params![cutoff_str], |row| Ok(RawRow { class: row.get(0)?, group: row.get(1)?, tl: row.get(2)?, colour: row.get(3)?, timestamp: row.get(4)?, description: row.get(5)? }))?;
        let mut incidents = Vec::new();
        let mut current_incident: Option<IncidentRecord> = None;
        let now = chrono::Utc::now();
        for r_res in rows_iter {
            let r = r_res?;
            let r_time = chrono::DateTime::parse_from_rfc3339(&r.timestamp).map(|dt| dt.with_timezone(&chrono::Utc)).unwrap_or(now);
            if let Some(mut curr) = current_incident.take() {
                if curr.class == r.class && curr.group == r.group && curr.tl == r.tl && curr.colour == r.colour {
                    current_incident = Some(curr);
                } else {
                    if curr.colour == "yellow" || curr.colour == "red" {
                        let start_dt = chrono::DateTime::parse_from_rfc3339(&curr.start_time).unwrap().with_timezone(&chrono::Utc);
                        curr.duration_seconds = (r_time - start_dt).num_seconds() as f64;
                        incidents.push(curr);
                    }
                    current_incident = Some(IncidentRecord { class: r.class, group: r.group, tl: r.tl, colour: r.colour, start_time: r.timestamp, duration_seconds: 0.0, description: r.description });
                }
            } else {
                current_incident = Some(IncidentRecord { class: r.class, group: r.group, tl: r.tl, colour: r.colour, start_time: r.timestamp, duration_seconds: 0.0, description: r.description });
            }
        }
        if let Some(mut curr) = current_incident {
            if curr.colour == "yellow" || curr.colour == "red" {
                let start_dt = chrono::DateTime::parse_from_rfc3339(&curr.start_time).unwrap().with_timezone(&chrono::Utc);
                curr.duration_seconds = (now - start_dt).num_seconds() as f64;
                incidents.push(curr);
            }
        }
        incidents.sort_by(|a, b| b.start_time.cmp(&a.start_time));
        Ok(incidents)
    }).await?
}

pub async fn get_current_states(pool: DbPool) -> Result<Vec<TrafficLightState>> {
    task::spawn_blocking(move || {
        let conn = pool.lock().map_err(|e| anyhow::anyhow!("Mutex lock failed: {}", e))?;
        let mut stmt = conn.prepare(r#"WITH ranked_tls AS (SELECT *, ROW_NUMBER() OVER (PARTITION BY class, group_name, tl ORDER BY timestamp DESC) as rn FROM traffic_lights) SELECT class, group_name, tl, colour, timestamp, expires_at, description, tags FROM ranked_tls WHERE rn = 1 ORDER BY class, group_name, tl"#)?;
        let tls_iter = stmt.query_map([], |row| {
            let tags_str: String = row.get(7)?;
            let tags_vec: Vec<String> = serde_json::from_str(&tags_str).unwrap_or_default();
            Ok(TrafficLightState { class: row.get(0)?, group: row.get(1)?, tl: row.get(2)?, colour: row.get(3)?, timestamp: row.get(4)?, expires_at: row.get(5)?, description: row.get(6)?, tags: tags_vec })
        })?;
        let mut tls = Vec::new();
        for tl in tls_iter { tls.push(tl?); }
        Ok(tls)
    }).await?
}

pub async fn get_history(pool: DbPool, class: String, group: String, tl: String) -> Result<Vec<TrafficLightState>> {
    task::spawn_blocking(move || {
        let conn = pool.lock().map_err(|e| anyhow::anyhow!("Mutex lock failed: {}", e))?;
        let mut stmt = conn.prepare("SELECT class, group_name, tl, colour, timestamp, expires_at, description, tags FROM traffic_lights WHERE class = ? AND group_name = ? AND tl = ? ORDER BY timestamp DESC")?;
        let tls_iter = stmt.query_map(params![class, group, tl], |row| {
            let tags_str: String = row.get(7)?;
            let tags_vec: Vec<String> = serde_json::from_str(&tags_str).unwrap_or_default();
            Ok(TrafficLightState { class: row.get(0)?, group: row.get(1)?, tl: row.get(2)?, colour: row.get(3)?, timestamp: row.get(4)?, expires_at: row.get(5)?, description: row.get(6)?, tags: tags_vec })
        })?;
        let mut tls = Vec::new();
        for tl in tls_iter { tls.push(tl?); }
        Ok(tls)
    }).await?
}

pub async fn get_metrics(pool: DbPool, class: String, group: String, tl: String) -> Result<Vec<MetricRecord>> {
    task::spawn_blocking(move || {
        let conn = pool.lock().map_err(|e| anyhow::anyhow!("Mutex lock failed: {}", e))?;
        let mut stmt = conn.prepare("SELECT class, group_name, tl, timestamp, key, value, value_str, metric_type, unit, green_if, yellow_if FROM metrics WHERE class = ? AND group_name = ? AND tl = ? ORDER BY timestamp ASC")?;
        let metrics_iter = stmt.query_map(params![class, group, tl], |row| {
            let green_if_str: Option<String> = row.get(9)?;
            let yellow_if_str: Option<String> = row.get(10)?;
            let green_if = green_if_str.and_then(|s| serde_json::from_str(&s).ok());
            let yellow_if = yellow_if_str.and_then(|s| serde_json::from_str(&s).ok());
            Ok(MetricRecord { class: row.get(0)?, group: row.get(1)?, tl: row.get(2)?, timestamp: row.get(3)?, key: row.get(4)?, value: row.get::<_, Option<f64>>(5)?.unwrap_or(0.0), value_str: row.get(6)?, metric_type: row.get(7)?, unit: row.get(8)?, green_if, yellow_if })
        })?;
        let mut metrics = Vec::new();
        for m in metrics_iter { metrics.push(m?); }
        Ok(metrics)
    }).await?
}
