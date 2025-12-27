use crate::models::IngestPayload;
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
    // We hold a thread-safe reference to a "master" connection or path
    // But since r2d2 creates connections on demand, we can't easily clone from a single master inside `connect` without a global or shared state.
    // However, DuckDB allows multiple connections to the same file *if* they are read-only OR if the main process handles locking correctly?
    // Actually, DuckDB cannot have two processes writing. But within one process, `Connection::try_clone` is the way.
    // We can wrap the master connection in an Arc<Mutex> inside the manager.
    master: Arc<Mutex<Connection>>,
}

impl r2d2::ManageConnection for DuckdbConnectionManager {
    type Connection = Connection;
    type Error = duckdb::Error;

    fn connect(&self) -> Result<Connection, duckdb::Error> {
        // Create a new connection by cloning the master
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
    // Set max size equal to what we want (e.g., number of threads)
    let pool = r2d2::Pool::builder().max_size(4).build(manager).map_err(|e| anyhow::anyhow!(e))?;

    // Initialize schema using the master connection directly (or a pooled one)
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
            for (_key, metric) in data {
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

        // Fetch raw rows ordered by class, tl, timestamp
        // We fetch slightly older data to ensure we catch the start of an ongoing incident if needed,
        // but for now strict cutoff is fine.
        let mut stmt = conn.prepare(
            r#"
            SELECT
                class,
                tl,
                colour,
                timestamp,
                description
            FROM traffic_lights
            WHERE timestamp >= ?
            ORDER BY class, tl, timestamp ASC
            "#
        )?;

        struct RawRow {
            class: String,
            tl: String,
            colour: String,
            timestamp: String,
            description: Option<String>,
        }

        let rows_iter = stmt.query_map(params![cutoff_str], |row| {
             Ok(RawRow {
                class: row.get(0)?,
                tl: row.get(1)?,
                colour: row.get(2)?,
                timestamp: row.get(3)?,
                description: row.get(4)?,
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

            // Check if we continue the current incident
            if let Some(mut curr) = current_incident.take() {
                if curr.class == r.class && curr.tl == r.tl && curr.colour == r.colour {
                    // Extend duration
                    // Duration is essentially "time since start" + "time until next update (or now)"
                    // But here we are iterating updates.
                    // If we have consecutive updates of same colour, they are one incident.
                    // The duration of the incident keeps growing.
                    // We calculate duration at the end or update it.
                    // Let's say duration is (latest_update_time - start_time) + duration_of_last_update?
                    // Actually, simpler: Duration is (r_time - start_time_dt).
                    // Wait, we don't know when the current state *ends* until the NEXT state change.
                    // So we accumulate.
                    current_incident = Some(curr);
                } else {
                    // State changed or different TL. Finalize current if it's yellow/red.
                    if curr.colour == "yellow" || curr.colour == "red" {
                        // Calculate duration: from start_time until this new row's time
                        let start_dt = chrono::DateTime::parse_from_rfc3339(&curr.start_time)
                            .unwrap()
                            .with_timezone(&chrono::Utc);
                        curr.duration_seconds = (r_time - start_dt).num_seconds() as f64;
                        incidents.push(curr);
                    }

                    // Start new potential incident
                    current_incident = Some(crate::models::IncidentRecord {
                        class: r.class,
                        tl: r.tl,
                        colour: r.colour,
                        start_time: r.timestamp,
                        duration_seconds: 0.0, // Will be updated
                        description: r.description,
                    });
                }
            } else {
                // Start first incident
                current_incident = Some(crate::models::IncidentRecord {
                    class: r.class,
                    tl: r.tl,
                    colour: r.colour,
                    start_time: r.timestamp,
                    duration_seconds: 0.0,
                    description: r.description,
                });
            }
        }

        // Handle the last ongoing incident
        if let Some(mut curr) = current_incident {
            if curr.colour == "yellow" || curr.colour == "red" {
                let start_dt = chrono::DateTime::parse_from_rfc3339(&curr.start_time)
                    .unwrap()
                    .with_timezone(&chrono::Utc);
                // Duration until now
                curr.duration_seconds = (now - start_dt).num_seconds() as f64;
                incidents.push(curr);
            }
        }

        // Filter final list to only include yellow/red (already done during finalize)
        // and reverse sort by start_time DESC for display
        incidents.sort_by(|a, b| b.start_time.cmp(&a.start_time));

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
