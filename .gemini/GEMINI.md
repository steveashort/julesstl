# Project Context
- **Project Name:** JulesSTL (Traffic Light System)
- **Tech Stack:** Rust (Axum/Tokio) Backend, React (Vite/Tailwind) Frontend, DuckDB.
- **Current State:** STABLE (as of 2026-01-03).
    - **Backend:** Ingestion worker and housekeeping tasks are active. Batch processing enabled.
    - **Frontend:** Dashboard, Details (with Charts & Aggregated History), Incidents Report, and Settings are fully functional. Visuals include stopwatch icons and "Xd Xh Xm" duration formatting.
    - **Simulator:** `remote_client_simulator.py` is updated to use UTC timestamps.
    - **Test Data:** `populate_test_data.ps1` is working.

# User Preferences
- **Development:** Windows 11 (dev environment), AIX (target, but simulating on x86).
- **Communication:** Concise, direct CLI tone.

# Recent History
- Restored broken ingestion and housekeeping background tasks.
- Fixed blank frontend by resolving missing variable definitions in `App.tsx`.
- Implemented aggregated history view (colour/duration) in `Details` page.
- Fixed negative durations and standardized duration formatting.
