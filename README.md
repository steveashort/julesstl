# Traffic Light System

A high-performance traffic light ingestion and reporting system built with **Rust** (Axum, DuckDB) and **React** (Vite, TailwindCSS).

## Prerequisites

Ensure you have the following installed on your system:

*   **Rust**: [Install Rust](https://www.rust-lang.org/tools/install) (latest stable version).
*   **Node.js**: [Install Node.js](https://nodejs.org/) (v18 or later) and `npm`.
*   **Python 3** (Optional, for generating test data).

## Download & Unpack

If you received this as a compressed archive:

```bash
tar -xvf traffic_light_system.tar.gz
cd traffic_light_system
```

If you cloned from a repository:

```bash
git clone <repo_url>
cd traffic_light_system
```

## Compilation & Installation

### 1. Build the Frontend

The frontend is a single-page React application. You need to build it so the Rust backend can serve the static files.

```bash
cd frontend
npm install
npm run build
cd ..
```

This will generate the static assets in `frontend/dist`.

### 2. Build the Backend

The backend is written in Rust. It compiles to a single binary.

```bash
# From the root directory
cargo build --release
```

The compiled binary will be located at `target/release/traffic_light_system`.

## Running the System

You can run the system directly using `cargo run` (for development) or using the compiled binary.

**Using Cargo:**

```bash
cargo run --release
```

**Using the Binary:**

```bash
./target/release/traffic_light_system
```

The system starts two servers:
*   **Ingestion API**: `http://localhost:3000`
*   **Web UI**: `http://localhost:3001`

## Usage

### Ingesting Data

Send JSON payloads to `POST http://localhost:3000/`.

**Example Payload:**

```json
{
  "class": "WebServer",
  "tl": "my_server_01",
  "colour": "inferred",
  "expires_at": "2025-11-29T20:46:58.410471900Z",
  "description": "Periodic server metrics capture.",
  "data": {
    "cpu_utilization": {
      "key": "cpu_utilization",
      "value": 26,
      "type": "gauge",
      "unit": "%",
      "yellow at": 70,
      "red at": 90
    }
  },
  "timestamp": "2025-11-29T20:41:58Z",
  "tags": ["tag1", "tag2"]
}
```

### Viewing Reports

1.  Open your web browser and navigate to `http://localhost:3001`.
2.  **Dashboard**: You will see a grid of all traffic lights grouped by class.
    *   Click on a traffic light card to view details.
3.  **Details View**:
    *   **State Durations**: A table showing how long the traffic light stayed in each colour state.
    *   **Metrics**: Interactive charts showing metric values over time (e.g., CPU utilization).
    *   **Raw History**: A chronological list of all updates.

## Testing

A Python script is included to generate sample data for verification.

```bash
# Install requests if needed
pip install requests

# Run the population script
python3 populate_test_data.py
```

This script simulates a "server" traffic light named "node1" transitioning through Green -> Yellow -> Red -> Green states over time.
