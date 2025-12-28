import requests
import json
from datetime import datetime, timedelta

# Configuration
BASE_URL = "http://localhost:9000"
CLASS_NAME = "server"
TL_NAME = "node1"
START_TIME = datetime.utcnow() - timedelta(hours=10) # Start 10 hours ago

# Sequence:
# 1. Green (6 updates)
# 2. Yellow (3 updates)
# 3. Red (2 updates)
# 4. Green (1 update)
# Interval: 30 minutes

sequence = [
    ("green", 6),
    ("yellow", 3),
    ("red", 2),
    ("green", 1)
]

current_time = START_TIME

for colour, count in sequence:
    for i in range(count):
        payload = {
            "class": CLASS_NAME,
            "group": "test-group",
            "tl": TL_NAME,
            "colour": colour,
            "expires_at": (current_time + timedelta(hours=1)).isoformat() + "Z",
            "description": f"Test update {i+1} for {colour}",
            "timestamp": current_time.isoformat() + "Z",
            "tags": ["test_run"]
        }

        try:
            response = requests.post(BASE_URL, json=payload)
            response.raise_for_status()
            print(f"Sent {colour} at {current_time}: {response.status_code}")
        except Exception as e:
            print(f"Failed to send {colour}: {e}")

        current_time += timedelta(minutes=30)

print("Data population complete.")
