import duckdb

try:
    conn = duckdb.connect('traffic_lights.db')
    print("Tables:", conn.execute("SHOW TABLES").fetchall())
    print("Traffic Lights Count:", conn.execute("SELECT COUNT(*) FROM traffic_lights").fetchone())
    print("Metrics Count:", conn.execute("SELECT COUNT(*) FROM metrics").fetchone())
    
    # Check a sample row
    print("Sample TL:", conn.execute("SELECT * FROM traffic_lights LIMIT 1").fetchone())
except Exception as e:
    print(f"Error: {e}")
