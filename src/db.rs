use crate::models::{IngestPayload, MetricData};
use anyhow::Result;
use duckdb::{params, Connection};
// use r2d2::Pool;
// use r2d2_duckdb::DuckdbConnectionManager;
use std::sync::{Arc, Mutex};
use tokio::task;

// Simplistic connection pooling using Mutex<Connection> if r2d2 fails
// Or just use a single connection wrapped in Mutex for now to pass compilation
// The issue with r2d2-duckdb is conflicting versions.
// Since I want efficiency, opening a new connection per request is bad (DuckDB startup).
// DuckDB handles concurrency internally if we clone the connection? No, Connection is not thread safe directly.
// But we can clone `Connection`? No.
// We can use `Connection::open_with_flags`?
// The best way without r2d2 is `Arc<Mutex<Connection>>` but that serializes all DB ops.
// However, `duckdb` allows cloning a connection? No.

// Let's implement a simple pool or just use `Arc<Mutex<Connection>>` for now to unblock.
// Actually, `duckdb` documentation says `Connection` is not Sync.
// So we need `Arc<Mutex<Connection>>`.
// But DuckDB is fast.
// Let's try to implement `r2d2::ManageConnection` for `duckdb::Connection` manually if needed, or just use `Arc<Mutex<Connection>>`.
// Given the "efficiency" requirement, serializing might be a bottleneck.
// But `duckdb` is an embedded DB.
// Another option: Use `r2d2` with a custom manager.

#[derive(Clone, Debug)]
pub struct DuckdbConnectionManager {
    path: String,
}

impl r2d2::ManageConnection for DuckdbConnectionManager {
    type Connection = Connection;
    type Error = duckdb::Error;

    fn connect(&self) -> Result<Connection, duckdb::Error> {
        Connection::open(&self.path)
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
    let manager = DuckdbConnectionManager { path: "traffic_lights.db".to_string() };
    let pool = r2d2::Pool::builder().max_size(4).build(manager).map_err(|e| anyhow::anyhow!(e))?;

    // Initialize schema
    let conn = pool.get().map_err(|e| anyhow::anyhow!(e))?;
    // tags stored as JSON string because Vec<String> support is tricky without casting or specific feature
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS traffic_lights (
            class VARCHAR,
            tl VARCHAR,
            colour VARCHAR,
            timestamp VARCHAR,
            expires_at VARCHAR,
            description VARCHAR,
            tags VARCHAR,
            PRIMARY KEY (class, tl, timestamp)
        );

        CREATE TABLE IF NOT EXISTS metrics (
            class VARCHAR,
            tl VARCHAR,
            timestamp VARCHAR,
            key VARCHAR,
            value DOUBLE,
            value_str VARCHAR,
            metric_type VARCHAR,
            unit VARCHAR
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
            "INSERT INTO traffic_lights (class, tl, colour, timestamp, expires_at, description, tags) VALUES (?, ?, ?, ?, ?, ?, ?)",
            params![
                payload.class,
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
            for (key, metric) in data {
                let (val_num, val_str) = match &metric.value {
                    serde_json::Value::Number(n) => (n.as_f64(), None),
                    serde_json::Value::String(s) => (None, Some(s.clone())),
                    _ => (None, None),
                };

                appender.append_row(params![
                    payload.class,
                    payload.tl,
                    payload.timestamp,
                    metric.key,
                    val_num,
                    val_str,
                    metric.metric_type,
                    metric.unit
                ])?;
            }
        }

        Ok::<_, anyhow::Error>(())
    }).await??;

    Ok(())
}

pub async fn get_incidents(pool: DbPool, hours: u32) -> Result<Vec<crate::models::IncidentRecord>> {
    let pool = pool.clone();

    // Recalculating cutoff in Rust to avoid SQL interval parameter issues
    let cutoff = chrono::Utc::now() - chrono::Duration::hours(hours as i64);
    let cutoff_str = cutoff.to_rfc3339();

    task::spawn_blocking(move || {
        let conn = pool.get().map_err(|e| anyhow::anyhow!(e))?;
        let mut stmt = conn.prepare(
            r#"
            WITH dur_calc AS (
                SELECT
                    class,
                    tl,
                    colour,
                    timestamp,
                    description,
                    LEAD(timestamp) OVER (PARTITION BY class, tl ORDER BY timestamp ASC) as next_timestamp
                FROM traffic_lights
            )
            SELECT
                class,
                tl,
                colour,
                timestamp,
                COALESCE(
                    date_diff('second', CAST(timestamp AS TIMESTAMP), CAST(next_timestamp AS TIMESTAMP)),
                    date_diff('second', CAST(timestamp AS TIMESTAMP), CURRENT_TIMESTAMP)
                ) as duration_seconds,
                description
            FROM dur_calc
            WHERE
                colour IN ('yellow', 'red')
                AND timestamp >= ?
            ORDER BY timestamp DESC
            "#
        )?;

        let incidents_iter = stmt.query_map(params![cutoff_str], |row| {
             Ok(crate::models::IncidentRecord {
                class: row.get(0)?,
                tl: row.get(1)?,
                colour: row.get(2)?,
                start_time: row.get(3)?,
                duration_seconds: row.get(4)?,
                description: row.get(5)?,
            })
        })?;

        let mut incidents = Vec::new();
        for i in incidents_iter {
            incidents.push(i?);
        }
        Ok(incidents)
    }).await?
}

pub async fn get_current_states(pool: DbPool) -> Result<Vec<crate::models::TrafficLightState>> {
    let pool = pool.clone();
    task::spawn_blocking(move || {
        let conn = pool.get().map_err(|e| anyhow::anyhow!(e))?;
        // Get the latest timestamp for each class/tl
        let mut stmt = conn.prepare(
            r#"
            WITH ranked_tls AS (
                SELECT *, ROW_NUMBER() OVER (PARTITION BY class, tl ORDER BY timestamp DESC) as rn
                FROM traffic_lights
            )
            SELECT class, tl, colour, timestamp, expires_at, description, tags
            FROM ranked_tls
            WHERE rn = 1
            ORDER BY class, tl
            "#
        )?;

        let tls_iter = stmt.query_map([], |row| {
             let tags_str: String = row.get(6)?;
             let tags_vec: Vec<String> = serde_json::from_str(&tags_str).unwrap_or_default();
             Ok(crate::models::TrafficLightState {
                class: row.get(0)?,
                tl: row.get(1)?,
                colour: row.get(2)?,
                timestamp: row.get(3)?,
                expires_at: row.get(4)?,
                description: row.get(5)?,
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

pub async fn get_history(pool: DbPool, class: String, tl: String) -> Result<Vec<crate::models::TrafficLightState>> {
    let pool = pool.clone();
    task::spawn_blocking(move || {
        let conn = pool.get().map_err(|e| anyhow::anyhow!(e))?;
        let mut stmt = conn.prepare(
            "SELECT class, tl, colour, timestamp, expires_at, description, tags FROM traffic_lights WHERE class = ? AND tl = ? ORDER BY timestamp DESC"
        )?;

        let tls_iter = stmt.query_map(params![class, tl], |row| {
             let tags_str: String = row.get(6)?;
             let tags_vec: Vec<String> = serde_json::from_str(&tags_str).unwrap_or_default();
             Ok(crate::models::TrafficLightState {
                class: row.get(0)?,
                tl: row.get(1)?,
                colour: row.get(2)?,
                timestamp: row.get(3)?,
                expires_at: row.get(4)?,
                description: row.get(5)?,
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

pub async fn get_metrics(pool: DbPool, class: String, tl: String) -> Result<Vec<crate::models::MetricRecord>> {
    let pool = pool.clone();
    task::spawn_blocking(move || {
        let conn = pool.get().map_err(|e| anyhow::anyhow!(e))?;
        let mut stmt = conn.prepare(
            "SELECT class, tl, timestamp, key, value, value_str, metric_type, unit FROM metrics WHERE class = ? AND tl = ? ORDER BY timestamp ASC"
        )?;

        let metrics_iter = stmt.query_map(params![class, tl], |row| {
             Ok(crate::models::MetricRecord {
                class: row.get(0)?,
                tl: row.get(1)?,
                timestamp: row.get(2)?,
                key: row.get(3)?,
                value: row.get::<_, Option<f64>>(4)?.unwrap_or(0.0),
                value_str: row.get(5)?,
                metric_type: row.get(6)?,
                unit: row.get(7)?,
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

        // Find latest state for each traffic light
        let mut stmt = conn.prepare(
            r#"
            WITH ranked_tls AS (
                SELECT class, tl, colour, timestamp, expires_at, ROW_NUMBER() OVER (PARTITION BY class, tl ORDER BY timestamp DESC) as rn
                FROM traffic_lights
            )
            SELECT class, tl, expires_at
            FROM ranked_tls
            WHERE rn = 1 AND colour != 'purple' AND expires_at IS NOT NULL
            "#
        )?;

        let tls_to_update: Vec<(String, String, String)> = stmt.query_map([], |row| {
             Ok((row.get(0)?, row.get(1)?, row.get(2)?))
        })?
        .filter_map(|r| r.ok())
        .collect();

        let now = chrono::Utc::now();

        for (class, tl, expires_at_str) in tls_to_update {
            if let Ok(expires_at) = chrono::DateTime::parse_from_rfc3339(&expires_at_str) {
                if expires_at.with_timezone(&chrono::Utc) < now {
                    // Expired! Insert purple record.
                    // We use current time as timestamp for the new state.
                    let timestamp = now.to_rfc3339();
                    let description = "Expired (Automatic Housekeeping)";
                    let tags_json = "[]"; // Empty tags for housekeeping update

                    conn.execute(
                        "INSERT INTO traffic_lights (class, tl, colour, timestamp, expires_at, description, tags) VALUES (?, ?, ?, ?, ?, ?, ?)",
                        params![
                            class,
                            tl,
                            "purple",
                            timestamp,
                            None::<String>, // Clear expires_at so it doesn't expire again immediately (though purple check handles it)
                            description,
                            tags_json
                        ],
                    )?;
                    println!("Housekeeping: Set {}/{} to purple (expired at {})", class, tl, expires_at_str);
                }
            }
        }

        Ok::<_, anyhow::Error>(())
    }).await??;

    Ok(())
}
