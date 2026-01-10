import http.client
import json
from datetime import datetime, timedelta
import random
import time
import sys

# --- Configuration ---
HOST = "localhost" 
PORT = 9000
UPDATE_INTERVAL_SECONDS = 60
SIMULATION_DURATION_SECONDS = 3600 # 1 hour

ZOO_CLASS = "zoo"
ZOO_GROUP = "zoo1"

ZOO_NAMES = [
    "San Diego Zoo", "Singapore Zoo", "Loro Parque", "St. Louis Zoo", "Lisbon Zoo",
    "Henry Doorly Zoo", "Rotterdam Zoo", "Cincinnati Zoo", "Prague Zoo", "Chester Zoo",
    "Tiergarten Schönbrunn", "Bronx Zoo", "Taronga Zoo", "Beauval Zoo", "Pairi Daiza",
    "Zurich Zoo", "Berlin Zoological Garden", "Beijing Zoo", "Moscow Zoo", "National Zoo of SA",
    "Taipei Zoo", "Ueno Zoo", "Melbourne Zoo", "London Zoo", "Burgers' Zoo",
    "Givskud Zoo", "Kolmården Wildlife Park", "Nordens Ark", "Skansen", "Borås Zoo",
    "Aalborg Zoo", "Odense Zoo", "Copenhagen Zoo", "Artis", "Zoo Antwerpen",
    "Planckendael", "Zoo Berlin", "Tierpark Berlin", "Wilhelma", "Zoo am Meer",
    "Erlebnis-Zoo Hannover", "Zoo Leipzig", "Zoo Frankfurt", "Zoo Köln", "Zoo München Hellabrunn",
    "Zoo Osnabrück", "Zoo Rostock", "Zoo Saarbrücken", "Zoo Schwerin", "Zoo Wuppertal"
]

def send_payload(conn, payload):
    try:
        body = json.dumps(payload, default=str)
        conn.request("POST", "/", body, {"Content-Type": "application/json"})
        response = conn.getresponse()
        response.read()
        return response.status in [200, 201, 202]
    except Exception as e:
        print(f"Error sending to {payload['tl']}: {e}")
        return False

def main():
    start_time = time.time()
    end_time = start_time + SIMULATION_DURATION_SECONDS
    print(f"Starting Zoo Simulator for {ZOO_CLASS}/{ZOO_GROUP}. Target: 50 TLs.")
    print(f"Updates every {UPDATE_INTERVAL_SECONDS}s for 1 hour.")

    while time.time() < end_time:
        try:
            conn = http.client.HTTPConnection(HOST, PORT, timeout=10)
            
            # Randomly select a subset (70-90%) to update this turn
            indices = random.sample(range(50), k=random.randint(35, 45))
            
            for i in indices:
                tl_id = f"z{i+1:03d}"
                zoo_name = ZOO_NAMES[i]
                now = datetime.utcnow()
                
                # Rules for status enum
                # green if: ["open"]
                # yellow if: ["closed"]
                # anything else is red (e.g., "maintenance", "storm", "unknown")
                status_options = ["open", "closed", "maintenance", "storm", "unknown", "locked"]
                current_status = random.choice(status_options)
                
                # Test PURPLE: 10% chance to have an immediate expiration (expires in 10s)
                # Others expire in 5-15 minutes
                is_purple_test = random.random() < 0.1
                expiration_minutes = 0.16 if is_purple_test else random.randint(5, 15)
                expires_at = now + timedelta(minutes=expiration_minutes)
                
                payload = {
                    "class": ZOO_CLASS,
                    "group": ZOO_GROUP,
                    "tl": tl_id,
                    "colour": "inferred",
                    "expires_at": expires_at.strftime('%Y-%m-%dT%H:%M:%SZ'),
                    "description": zoo_name,
                    "timestamp": now.strftime('%Y-%m-%dT%H:%M:%SZ'),
                    "tags": ["zoo", "test"],
                    "data": {
                        "status": {
                            "key": "status",
                            "value": current_status,
                            "type": "enum",
                            "green if": ["open"],
                            "yellow if": ["closed"]
                        }
                    }
                }
                send_payload(conn, payload)

            conn.close()
            elapsed = int(time.time() - start_time)
            print(f"[{datetime.now().strftime('%H:%M:%S')}] Updated {len(indices)} zoos. {elapsed}/{SIMULATION_DURATION_SECONDS}s elapsed.")
            
        except Exception as e:
            print(f"Loop error: {e}")
        
        time.sleep(UPDATE_INTERVAL_SECONDS)

    print("Zoo simulation finished.")

if __name__ == "__main__":
    main()
