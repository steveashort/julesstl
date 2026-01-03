import http.client
import json
from datetime import datetime, timedelta
import random
import time
import sys

# --- Configuration ---
# Replace with the actual IP address of your server
HOST = "localhost" 
PORT = 9000
UPDATE_INTERVAL_SECONDS = 30

# --- Traffic Light Definitions ---
NUM_SERVERS = 100
NUM_STORES = 100

SERVER_CLASS = "server"
SERVER_GROUP = "remote-test"
SERVER_PREFIX = "steve-"

STORE_CLASS = "store"
STORE_GROUP = "retail-main"
STORE_PREFIX = "store-"

def get_server_list():
    return [f"{SERVER_PREFIX}{i+1:03d}" for i in range(NUM_SERVERS)]

def get_store_list():
    return [f"{STORE_PREFIX}{i+1:03d}" for i in range(NUM_STORES)]

def send_payload(conn, payload):
    """Sends a single payload to the server."""
    try:
        body = json.dumps(payload, default=str)
        conn.request("POST", "/", body, {"Content-Type": "application/json"})
        response = conn.getresponse()
        response.read() # Must read response to reuse connection
        if response.status not in [200, 201, 202]:
            print(f"WARN: Received non-success status {response.status} for {payload['tl']}")
        return True
    except (http.client.HTTPException, ConnectionRefusedError, ConnectionResetError) as e:
        print(f"ERROR: Connection failed for {payload['tl']}: {e}")
        return False
    except Exception as e:
        print(f"ERROR: Failed to send data for {payload['tl']}: {e}")
        return False

def main():
    if len(sys.argv) > 1:
        global HOST
        HOST = sys.argv[1]
        print(f"Target host set to: {HOST}")

    all_servers = get_server_list()
    all_stores = get_store_list()
    
    print(f"Starting remote client simulator. Updating a subset of {len(all_servers)} servers and {len(all_stores)} stores every {UPDATE_INTERVAL_SECONDS} seconds.")
    print("Press Ctrl+C to stop.")

    while True:
        try:
            conn = http.client.HTTPConnection(HOST, PORT, timeout=10)
            
            # --- Update Servers (with inferred metrics) ---
            # Randomly select 50-80% of servers to update
            servers_to_update = random.sample(all_servers, k=random.randint(int(NUM_SERVERS * 0.5), int(NUM_SERVERS * 0.8)))
            
            for tl_name in servers_to_update:
                now = datetime.utcnow()
                expires_at = now + timedelta(minutes=random.randint(1, 20))
                
                status_enums = ["Server Up", "Server OK", "Server hot", "Service Down", "High Load"]
                
                payload = {
                    "class": SERVER_CLASS,
                    "group": SERVER_GROUP,
                    "tl": tl_name,
                    "colour": "inferred",
                    "expires_at": expires_at.strftime('%Y-%m-%dT%H:%M:%SZ'),
                    "description": f"Remote status update for {tl_name}",
                    "timestamp": now.strftime('%Y-%m-%dT%H:%M:%SZ'),
                    "tags": ["remote"],
                    "data": {
                        "CPU": {
                            "key": "CPU",
                            "value": round(random.uniform(5.0, 99.0), 2),
                            "type": "gauge",
                            "unit": "%",
                            "green if": ["0:65"],
                            "yellow if": ["65:85"]
                        },
                        "Memory": {
                            "key": "Memory",
                            "value": round(random.uniform(10.0, 98.0), 2),
                            "type": "gauge",
                            "unit": "%",
                            "green if": ["0:80"],
                            "yellow if": ["80:95"]
                        },
                        "Run Queue": {
                            "key": "Run Queue",
                            "value": random.randint(0, 15),
                            "type": "gauge",
                            "unit": "processes",
                             "green if": ["0:5"],
                            "yellow if": ["5:10"]
                        },
                        "Status": {
                             "key": "Status",
                             "value": random.choice(status_enums),
                             "type": "enum",
                             "green if": ["Server Up", "Server OK"],
                             "yellow if": ["Server hot"]
                        }
                    }
                }
                if not send_payload(conn, payload):
                    conn.close()
                    conn = http.client.HTTPConnection(HOST, PORT, timeout=10)

            stores_to_update = random.sample(all_stores, k=random.randint(int(NUM_STORES * 0.5), int(NUM_STORES * 0.8)))

            for tl_name in stores_to_update:
                now = datetime.utcnow()
                expires_at = now + timedelta(minutes=random.randint(1, 20))
                
                payload = {
                    "class": STORE_CLASS,
                    "group": STORE_GROUP,
                    "tl": tl_name,
                    "colour": random.choice(["green", "yellow", "red"]),
                    "expires_at": expires_at.strftime('%Y-%m-%dT%H:%M:%SZ'),
                    "description": f"Remote status for {tl_name}",
                    "timestamp": now.strftime('%Y-%m-%dT%H:%M:%SZ'),
                    "tags": ["retail"],
                    "data": None
                }
                if not send_payload(conn, payload):
                    conn.close()
                    conn = http.client.HTTPConnection(HOST, PORT, timeout=10)

            conn.close()
            print(f"[{datetime.now().strftime('%H:%M:%S')}] Sent updates for {len(servers_to_update)} servers and {len(stores_to_update)} stores.")

        except Exception as e:
            print(f"An unexpected error occurred in main loop: {e}")
        
        time.sleep(UPDATE_INTERVAL_SECONDS)

if __name__ == "__main__":
    main()
