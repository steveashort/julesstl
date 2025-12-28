use crate::models::IngestPayload;
use anyhow::Result;
use duckdb::{params, Connection};
use std::sync::{Arc, Mutex};
use tokio::task;

#[derive(Clone, Debug)]
pub struct DuckdbConnectionManager {
    master: Arc<Mutex<Connection>>,
}

impl r2d2::ManageConnection for DuckdbConnectionManager {
    type Connection = Connection;
    type Error = duckdb::Error;

    fn connect(&self) -> Result<Connection, duckdb::Error> {
        let guard = self.master.lock().unwrap();
        guard.try_clone()
    }

    fn is_valid(&self, conn: &mut Connection) -> Result<(), duckdb::Error> {
        conn.execute("SELECT 1", [])?;
        Ok(())
    }

    fn has_broken(&self, _conn: &mut Connection) -> bool {
        false
    }
}

pub type DbPool = Arc<r2d2::Pool<DuckdbConnectionManager>>;

pub fn init_pool() -> Result<DbPool> {
    let path = "traffic_lights.db";
    let conn = Connection::open(path)?;
    let master = Arc::new(Mutex::new(conn));

    let manager = DuckdbConnectionManager { master: master.clone() };
    let pool = r2d2::Pool::builder().max_size(4).build(manager).map_err(|e| anyhow::anyhow!(e))?;

    let conn = pool.get().map_err(|e| anyhow::anyhow!(e))?;
    
    // Schema update: Drop existing to enforce new schema with group_name and updated metrics columns
    conn.execute_batch(
        r#"
        DROP TABLE IF EXISTS traffic_lights;
        DROP TABLE IF EXISTS metrics;

        CREATE TABLE traffic_lights (
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

        CREATE TABLE metrics (
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

    Ok(Arc::new(pool))
}

pub async fn insert_traffic_light(pool: DbPool, payload: IngestPayload, final_colour: String) -> Result<()> {
    let pool = pool.clone();
    task::spawn_blocking(move || {
        let conn = pool.get().map_err(|e| anyhow::anyhow!(e))?;
        let tags_json = serde_json::to_string(&payload.tags.unwrap_or_default())?;

        conn.execute(
            "INSERT INTO traffic_lights (class, group_name, tl, colour, timestamp, expires_at, description, tags) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            params![
                payload.class,
                payload.group,
                payload.tl,
                final_colour,
                payload.timestamp,
                payload.expires_at,
                payload.description,
                tags_json
            ],
        )?;

        if let Some(data) = payload.data {
            let mut appender = conn.appender("metrics")?;
            for (_key, metric) in data {
                let (val_num, val_str) = match &metric.value {
                    serde_json::Value::Number(n) => (n.as_f64(), None),
                    serde_json::Value::String(s) => (None, Some(s.clone())),
                    _ => (None, None),
                };
                
                let green_if_json = metric.green_if.as_ref().map(|v| serde_json::to_string(v).unwrap_or_default());
                let yellow_if_json = metric.yellow_if.as_ref().map(|v| serde_json::to_string(v).unwrap_or_default());

                appender.append_row(params![
                    payload.class,
                    payload.group,
                    payload.tl,
                    payload.timestamp,
                    metric.key,
                    val_num,
                    val_str,
                    metric.metric_type,
                    metric.unit,
                    green_if_json,
                    yellow_if_json
                ])?;
            }
        }

        Ok::<_, anyhow::Error>(())
    }).await??;

    Ok(())
}

pub async fn get_incidents(pool: DbPool, hours: u32) -> Result<Vec<crate::models::IncidentRecord>> {
    let pool = pool.clone();
    let cutoff = chrono::Utc::now() - chrono::Duration::hours(hours as i64);
    let cutoff_str = cutoff.to_rfc3339();

    task::spawn_blocking(move || {
        let conn = pool.get().map_err(|e| anyhow::anyhow!(e))?;

        let mut stmt = conn.prepare(
            r#"
            SELECT
                class,
                group_name,
                tl,
                colour,
                timestamp,
                description
            FROM traffic_lights
            WHERE timestamp >= ?
            ORDER BY class, group_name, tl, timestamp ASC
            "#
        )?;

        struct RawRow {
            class: String,
            group: String,
            tl: String,
            colour: String,
            timestamp: String,
            description: Option<String>,
        }

        let rows_iter = stmt.query_map(params![cutoff_str], |row| {
             Ok(RawRow {
                class: row.get(0)?,
                group: row.get(1)?,
                tl: row.get(2)?,
                colour: row.get(3)?,
                timestamp: row.get(4)?,
                description: row.get(5)?,
            })
        })?;

        let mut incidents = Vec::new();
        let mut current_incident: Option<crate::models::IncidentRecord> = None;
        let now = chrono::Utc::now();

        for r_res in rows_iter {
            let r = r_res?;
            let r_time = chrono::DateTime::parse_from_rfc3339(&r.timestamp)
                .map(|dt| dt.with_timezone(&chrono::Utc))
                .unwrap_or(now);

            if let Some(mut curr) = current_incident.take() {
                if curr.class == r.class && curr.group == r.group && curr.tl == r.tl && curr.colour == r.colour {
                    current_incident = Some(curr);
                } else {
                    if curr.colour == "yellow" || curr.colour == "red" {
                        let start_dt = chrono::DateTime::parse_from_rfc3339(&curr.start_time)
                            .unwrap()
                            .with_timezone(&chrono::Utc);
                        curr.duration_seconds = (r_time - start_dt).num_seconds() as f64;
                        incidents.push(curr);
                    }

                    current_incident = Some(crate::models::IncidentRecord {
                        class: r.class,
                        group: r.group,
                        tl: r.tl,
                        colour: r.colour,
                        start_time: r.timestamp,
                        duration_seconds: 0.0,
                        description: r.description,
                    });
                }
            } else {
                current_incident = Some(crate::models::IncidentRecord {
                    class: r.class,
                    group: r.group,
                    tl: r.tl,
                    colour: r.colour,
                    start_time: r.timestamp,
                    duration_seconds: 0.0,
                    description: r.description,
                });
            }
        }

        if let Some(mut curr) = current_incident {
            if curr.colour == "yellow" || curr.colour == "red" {
                let start_dt = chrono::DateTime::parse_from_rfc3339(&curr.start_time)
                    .unwrap()
                    .with_timezone(&chrono::Utc);
                curr.duration_seconds = (now - start_dt).num_seconds() as f64;
                incidents.push(curr);
            }
        }

        incidents.sort_by(|a, b| b.start_time.cmp(&a.start_time));
        Ok(incidents)
    }).await?
}

pub async fn get_current_states(pool: DbPool) -> Result<Vec<crate::models::TrafficLightState>> {
    let pool = pool.clone();
    task::spawn_blocking(move || {
        let conn = pool.get().map_err(|e| anyhow::anyhow!(e))?;
        let mut stmt = conn.prepare(
            r#"
            WITH ranked_tls AS (
                SELECT *, ROW_NUMBER() OVER (PARTITION BY class, group_name, tl ORDER BY timestamp DESC) as rn
                FROM traffic_lights
            )
            SELECT class, group_name, tl, colour, timestamp, expires_at, description, tags
            FROM ranked_tls
            WHERE rn = 1
            ORDER BY class, group_name, tl
            "#
        )?;

        let tls_iter = stmt.query_map([], |row| {
             let tags_str: String = row.get(7)?;
             let tags_vec: Vec<String> = serde_json::from_str(&tags_str).unwrap_or_default();
             Ok(crate::models::TrafficLightState {
                class: row.get(0)?,
                group: row.get(1)?,
                tl: row.get(2)?,
                colour: row.get(3)?,
                timestamp: row.get(4)?,
                expires_at: row.get(5)?,
                description: row.get(6)?,
                tags: tags_vec,
            })
        })?;

        let mut tls = Vec::new();
        for tl in tls_iter {
            tls.push(tl?);
        }
        Ok(tls)
    }).await?
}

pub async fn get_history(pool: DbPool, class: String, group: String, tl: String) -> Result<Vec<crate::models::TrafficLightState>> {
    let pool = pool.clone();
    task::spawn_blocking(move || {
        let conn = pool.get().map_err(|e| anyhow::anyhow!(e))?;
        let mut stmt = conn.prepare(
            "SELECT class, group_name, tl, colour, timestamp, expires_at, description, tags FROM traffic_lights WHERE class = ? AND group_name = ? AND tl = ? ORDER BY timestamp DESC"
        )?;

        let tls_iter = stmt.query_map(params![class, group, tl], |row| {
             let tags_str: String = row.get(7)?;
             let tags_vec: Vec<String> = serde_json::from_str(&tags_str).unwrap_or_default();
             Ok(crate::models::TrafficLightState {
                class: row.get(0)?,
                group: row.get(1)?,
                tl: row.get(2)?,
                colour: row.get(3)?,
                timestamp: row.get(4)?,
                expires_at: row.get(5)?,
                description: row.get(6)?,
                tags: tags_vec,
            })
        })?;

        let mut tls = Vec::new();
        for tl in tls_iter {
            tls.push(tl?);
        }
        Ok(tls)
    }).await?
}

pub async fn get_metrics(pool: DbPool, class: String, group: String, tl: String) -> Result<Vec<crate::models::MetricRecord>> {
    let pool = pool.clone();
    task::spawn_blocking(move || {
        let conn = pool.get().map_err(|e| anyhow::anyhow!(e))?;
        let mut stmt = conn.prepare(
            "SELECT class, group_name, tl, timestamp, key, value, value_str, metric_type, unit, green_if, yellow_if FROM metrics WHERE class = ? AND group_name = ? AND tl = ? ORDER BY timestamp ASC"
        )?;

        let metrics_iter = stmt.query_map(params![class, group, tl], |row| {
             let green_if_str: Option<String> = row.get(9)?;
             let yellow_if_str: Option<String> = row.get(10)?;
             
             let green_if = green_if_str.and_then(|s| serde_json::from_str(&s).ok());
             let yellow_if = yellow_if_str.and_then(|s| serde_json::from_str(&s).ok());

             Ok(crate::models::MetricRecord {
                class: row.get(0)?,
                group: row.get(1)?,
                tl: row.get(2)?,
                timestamp: row.get(3)?,
                key: row.get(4)?,
                value: row.get::<_, Option<f64>>(5)?.unwrap_or(0.0),
                value_str: row.get(6)?,
                metric_type: row.get(7)?,
                unit: row.get(8)?,
                green_if,
                yellow_if,
            })
        })?;

        let mut metrics = Vec::new();
        for m in metrics_iter {
            metrics.push(m?);
        }
        Ok(metrics)
    }).await?
}

pub async fn check_and_update_expirations(pool: DbPool) -> Result<()> {
    let pool = pool.clone();
    task::spawn_blocking(move || {
        let conn = pool.get().map_err(|e| anyhow::anyhow!(e))?;

        let mut stmt = conn.prepare(
            r#"
            WITH ranked_tls AS (
                SELECT class, group_name, tl, colour, timestamp, expires_at, ROW_NUMBER() OVER (PARTITION BY class, group_name, tl ORDER BY timestamp DESC) as rn
                FROM traffic_lights
            )
            SELECT class, group_name, tl, expires_at
            FROM ranked_tls
            WHERE rn = 1 AND colour != 'purple' AND expires_at IS NOT NULL
            "#
        )?;

        let tls_to_update: Vec<(String, String, String, String)> = stmt.query_map([], |row| {
             Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
        })?
        .filter_map(|r| r.ok())
        .collect();

        let now = chrono::Utc::now();

        for (class, group, tl, expires_at_str) in tls_to_update {
            if let Ok(expires_at) = chrono::DateTime::parse_from_rfc3339(&expires_at_str) {
                if expires_at.with_timezone(&chrono::Utc) < now {
                    let timestamp = now.to_rfc3339();
                    let description = "Expired (Automatic Housekeeping)";
                    let tags_json = "[]";

                    conn.execute(
                        "INSERT INTO traffic_lights (class, group_name, tl, colour, timestamp, expires_at, description, tags) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                        params![
                            class,
                            group,
                            tl,
                            "purple",
                            timestamp,
                            None::<String>,
                            description,
                            tags_json
                        ],
                    )?;
                    println!("Housekeeping: Set {}/{}/{} to purple (expired at {})", class, group, tl, expires_at_str);
                }
            }
        }

        Ok::<_, anyhow::Error>(())
    }).await??;

    Ok(())
}
