import http.client
import json
from datetime import datetime, timedelta
import random
import time

HOST = "localhost"
PORT = 9000
NUM_SERVERS = 500
DAYS = 30
INTERVAL_HOURS = 2

tag_combinations = [
    ["prod", "frontend"],
    ["prod", "database"],
    ["prod", "backend"],
    ["non-prod", "frontend"],
    ["non-prod", "database"],
    ["non-prod", "backend"]
]

start_time = datetime.utcnow() - timedelta(days=DAYS)
total_requests = NUM_SERVERS * (DAYS * 24 // INTERVAL_HOURS)
print(f"Starting bulk population of {NUM_SERVERS} servers for {DAYS} days (~{total_requests} updates)...")

conn = http.client.HTTPConnection(HOST, PORT)

request_count = 0
start_perf = time.time()

for s in range(NUM_SERVERS):
    server_name = f"server-{s+1:03d}"
    tags = tag_combinations[s % len(tag_combinations)]
    
    current_time = start_time
    cpu_base = random.uniform(20, 60)
    mem_base = random.uniform(30, 70)
    
    # Re-connect occasionally to avoid issues with long-lived connections
    if s % 50 == 0:
        conn.close()
        conn = http.client.HTTPConnection(HOST, PORT)

    while current_time < datetime.utcnow():
        cpu_val = max(0, min(100, cpu_base + random.uniform(-15, 15)))
        mem_val = max(0, min(100, mem_base + random.uniform(-10, 10)))
        
        colour = "green"
        if cpu_val > 90 or mem_val > 95:
            colour = "red"
        elif cpu_val > 75 or mem_val > 85:
            colour = "yellow"
            
        payload = {
            "class": "server",
            "tl": server_name,
            "colour": colour,
            "expires_at": (current_time + timedelta(hours=INTERVAL_HOURS + 1)).isoformat() + "Z",
            "description": f"Bulk test update for {server_name}",
            "timestamp": current_time.isoformat() + "Z",
            "tags": tags,
            "data": {
                "CPU": {
                    "key": "CPU",
                    "value": cpu_val,
                    "type": "gauge",
                    "unit": "%",
                    "yellow at": 75,
                    "red at": 90
                },
                "Memory": {
                    "key": "Memory",
                    "value": mem_val,
                    "type": "gauge",
                    "unit": "%",
                    "yellow at": 85,
                    "red at": 95
                }
            }
        }
        
        try:
            body = json.dumps(payload)
            conn.request("POST", "/", body, {"Content-Type": "application/json"})
            response = conn.getresponse()
            response.read() # Consume response
            request_count += 1
        except Exception as e:
            print(f"Failed to send data for {server_name} at {current_time}: {e}")
            # Try to reconnect
            try:
                conn.close()
                conn = http.client.HTTPConnection(HOST, PORT)
            except:
                pass
            
        current_time += timedelta(hours=INTERVAL_HOURS)
    
    if (s + 1) % 10 == 0:
        elapsed = time.time() - start_perf
        rate = request_count / elapsed if elapsed > 0 else 0
        print(f"Populated {s + 1}/{NUM_SERVERS} servers. Total requests: {request_count}. Rate: {rate:.1f} req/s")

conn.close()
print("Bulk population complete.")
