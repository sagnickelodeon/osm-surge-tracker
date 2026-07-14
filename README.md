# 🌍 OSM Mapping Surge Tracker

### ▶️ [Live dashboard](https://osm-surge-tracker.vercel.app) · [Architecture](ARCHITECTURE.md) · [Run locally](RUNNING_LOCALLY.md)

[![Live demo](https://img.shields.io/badge/demo-live-brightgreen)](https://osm-surge-tracker.vercel.app)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Python 3.13](https://img.shields.io/badge/python-3.13-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![Next.js](https://img.shields.io/badge/Next.js-000000?logo=next.js&logoColor=white)](https://nextjs.org/)

**A real-time anomaly-detection system that watches OpenStreetMap edits worldwide and flags regions experiencing an unusual spike in mapping activity** — an early signal of a disaster, humanitarian response, or major local event.

When a flood hits Karnataka or an earthquake strikes Türkiye, volunteers flood OpenStreetMap with new buildings, roads, and hospitals within hours. This system detects that surge automatically — comparing each region's live edit volume against its own 7-day, hour-of-day baseline — and surfaces it on a live dashboard with an AI-generated explanation and related news headlines.

> Built by a data engineer as an end-to-end exercise in **streaming data architecture**: ingestion → stream processing → a Bronze/Silver/Gold medallion warehouse → a read API → a live dashboard.

### Engineering highlights

- **Single-writer DuckDB → Parquet serving layer** — the processor holds the sole read-write lock and exports Parquet snapshots every 60 s, so a separate API process serves always-fresh data with zero lock contention.
- **8-coroutine `asyncio` stream processor** — enrich/geocode, windowing, baselines, z-score detection, AI explanation, snapshot export and archival run concurrently, each self-restarting on failure.
- **z-score baseline detection** — each region is scored against its own rolling 7-day, hour-of-day baseline, with multi-condition gating tuned to suppress false positives.
- **Graceful-degradation, fail-closed design** — endpoints return safe empty values instead of 500s, the dashboard shows a banner not a stack trace, and the API refuses to start in production without its auth secret.

---

## What it looks like

[![OSM Surge Tracker dashboard](images/dashboard-screenshot.png)](https://osm-surge-tracker.vercel.app)

---

## How it works

![OSM Surge Tracker data-flow: OpenStreetMap diffs → Poller → Redis → Stream Processor (Bronze/Silver/Gold + surge detection + GDELT/OpenAI enrichment + DuckDB) → Parquet → FastAPI → Next.js dashboard](images/how-it-works.svg)

| # | Component | Role |
|---|-----------|------|
| 1 | **Poller** (`poller/`) | Pulls OSM minutely diffs every 60 s, parses every edit, pushes raw events to a Redis Stream. |
| 2 | **Stream Processor** (`processor/`) | Eight `asyncio` coroutines: enrich + geocode → Bronze; 5-min windows → Silver; rolling baselines; z-score detection → Gold; AI explanation; Parquet export; hourly silver/gold archive to Azure Blob. |
| 3a | **FastAPI** (`api/`) | Thin read-only JSON API over the Gold/Silver data, plus a `/track` beacon that feeds an hourly visitor log to Azure Blob. |
| 3b | **Next.js** (`dashboard-web/`) | Dark "intelligence monitor" dashboard with a live deck.gl map and surge feed. Calls the API through its own server-side proxy. |

### The medallion warehouse (DuckDB)

| Layer | Table | Grain | Retention |
|-------|-------|-------|-----------|
| 🥉 Bronze | `bronze_raw_edits` | one row per OSM edit, geocoded | 3 days |
| 🥈 Silver | `silver_windowed_edits` | one row per region per 5-min window | 8 days |
| — | `baselines` | rolling 7-day avg/std per region × hour-of-day | rebuilt hourly |
| 🥇 Gold | `gold_surges` | one row per confirmed surge | kept |

### Surge detection

A region is flagged only when **all** conditions hold simultaneously (tuned to suppress false positives):

- `unique_users >= 3` — multiple independent mappers, not a single-account bulk import
- `z_score > 4.0` — statistically unusual vs. the region's baseline for that hour of day
- `surge_magnitude > 10.0` — at least 10× its normal edit volume
- `edit_count > 1000` — enough absolute volume to matter

A cold-start fallback (before baselines exist) flags regions exceeding **2× the 95th percentile of multi-mapper edit volume** (single-account bulk imports are excluded so they can't inflate the threshold; the same `edit_count`, `surge_magnitude`, and `unique_users` floors apply).

---

## Tech stack

| Concern | Choice |
|---|---|
| Language | Python 3.13 |
| Ingestion | `requests`, `pyosmium`, Redis Streams |
| Stream processing | `asyncio`, `reverse_geocoder` |
| Warehouse | **DuckDB** (embedded OLAP) + Parquet |
| Enrichment | GDELT Cloud Events API + OpenAI (`gpt-4o-mini`) |
| API | **FastAPI** + Uvicorn + Pydantic v2 |
| Dashboard | **Next.js** (React, TypeScript) + **deck.gl** + **MapLibre** (token-free Carto dark basemap) |
| Hosting | Azure B1ms VM (1–3a) · Vercel (3b) |

---

## Repository layout

```
├── README.md           (this file)
├── ARCHITECTURE.md     deep dive into every module and data flow
├── RUNNING_LOCALLY.md  step-by-step local setup + troubleshooting
├── LICENSE             MIT
├── requirements.txt    combined install manifest (all components)
└── src/
    ├── poller/         Component 1 — OSM ingestion
    ├── processor/      Component 2 — stream processing + warehouse + snapshots
    │   ├── snapshot.py      exports Parquet for the API (the serving bridge)
    │   ├── blob_uploader.py hourly silver/gold archive → Azure Blob (optional)
    │   └── timeutil.py      IST timezone helpers (now_ist)
    ├── api/            Component 3a — FastAPI read API
    │   ├── main.py · db.py · models.py · timeutil.py · routes/{surges,heatmap,stats,track}.py
    │   ├── updates.py  60s Blob refresh of what's-new/coming lists → served via /stats
    │   └── visitors.py · blob_storage.py  hourly visitor log → Azure Blob (optional)
    ├── dashboard-web/  Component 3b — Next.js dashboard (React + deck.gl)
    │   ├── app/{layout,page}.tsx · app/api/osm/[...path]/route.ts (server-side proxy)
    │   ├── app/api/track/route.ts  visitor beacon proxy (forwards trusted client IP)
    │   ├── components/{Header,SurgeFeed,SurgeCard,HistoryTable,ChangelogModal,SurgeMap}.tsx
    │   └── lib/{api,config,countries,terminator,time}.ts
    └── secret.env.example  template for optional keys/config (copy to secret.env)
```

---

## Quick start

**Prerequisites:** Python 3.13, a running Redis instance, and Node.js 18+ (for the
dashboard, Component 3b).

```bash
# from src/, create + activate the shared venv
python -m venv osm
source osm/bin/activate              # Windows: .\osm\Scripts\activate

# one combined manifest (at the repo root) installs everything
pip install -r ../requirements.txt
```

Optionally copy `secret.env.example` to `secret.env` and fill it in (`GDELT_API_KEY`, `OPENAI_API_KEY` — both optional;
without them, surges are still recorded, just with no news/explanation). Every
component auto-loads `secret.env`, so no manual environment exports are needed.

Run each component in its own terminal:

```bash
# 1. Poller
cd poller && python poller.py

# 2. Processor (also writes data/api/*.parquet every 60s)
cd processor && python processor.py

# 3a. API — run from src/ so `api` imports as a package
python -m api.main                   # → http://localhost:8000

# 3b. Dashboard (Node.js — first time: npm install)
cd dashboard-web && npm install && npm run dev  # → http://localhost:3000
```

The dashboard's server-side proxy points at the API via `API_BASE_URL`
(defaults to `http://localhost:8000`). To override locally:

```bash
cd dashboard-web && echo "API_BASE_URL=http://localhost:8000" > .env.local
```

📖 **Step-by-step:** [RUNNING_LOCALLY.md](RUNNING_LOCALLY.md) (expected logs, timing,
troubleshooting).

### Optional environment variables

| Variable | Component | Default | Purpose |
|---|---|---|---|
| `REDIS_HOST` / `REDIS_PORT` | poller, processor | `localhost` / `6379` | Redis location |
| `PROCESSOR_START_ID` | processor | `$` | `$` = new messages only; `0` = replay backlog |
| `GDELT_API_KEY` | processor | — | enables news via GDELT Cloud Events API (optional) |
| `OPENAI_API_KEY` | processor | — | enables AI explanations (optional) |
| `API_PARQUET_DIR` | api | `<repo>/data/api` | where to read Parquet snapshots |
| `AZURE_STORAGE_CONNECTION_STRING` | processor, api | — | enables the silver/gold archive + hourly visitor log (optional) |
| `AZURE_BLOB_CONTAINER` | processor, api | — | target blob container for the archive + visitor log (optional) |
| `API_BASE_URL` | dashboard | `http://localhost:8000` | API location (read by the dashboard's server-side proxy) |

---

## API reference

Base URL: `http://<host>:8000`

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Liveness probe → `{status, timestamp}` |
| `GET` | `/surges/active` | Active surges in the last 2 h, strongest first |
| `GET` | `/surges/history` | Historical surges. Params: `days` (≤90), `country_code`, `min_magnitude`, `limit` (≤1000) |
| `GET` | `/heatmap` | Per-region edit density, last 1 h (a live pulse that tracks the daytime hemisphere) |
| `GET` | `/stats` | Header summary: surges today, countries, peak magnitude, edits/hr — plus the `whats_new` / `whats_coming` update lists shown by the dashboard's header buttons |
| `POST` | `/track` | Visitor beacon (fired by the dashboard); records a salted **hash** of the IP + user-agent for the hourly visitor log → 204 |

```bash
curl http://localhost:8000/surges/active
curl "http://localhost:8000/surges/history?days=7&min_magnitude=5.0&country_code=IN"
```

All endpoints return empty lists/objects rather than errors on missing data, so clients never have to handle 500s for an empty warehouse.

---

## Design notes worth knowing

**Why Parquet snapshots between the processor and the API?**
DuckDB allows only one process to hold a database file open read-write. The processor keeps that lock for life, so the API (a separate process) cannot open the same file — *not even read-only*. The processor therefore exports the API's tables to Parquet every 60 s, and the API queries those files through its own in-memory DuckDB connection: no lock contention, multiple readers, always fresh. See [`ARCHITECTURE.md`](ARCHITECTURE.md) for the full reasoning.

**Resilience.** Every long-running loop is wrapped in `while True: try/except`, so a transient failure restarts one coroutine without taking down the rest. Redis consumer groups give at-least-once delivery (messages are ACKed only after a confirmed DuckDB write). The CPU-bound geocoder runs via `asyncio.to_thread` so it can't stall the event loop, and the explainer caps concurrent GDELT/OpenAI calls with a semaphore so a surge burst can't self-DoS into timeouts. The dashboard degrades gracefully — an unreachable API shows a banner, not a stack trace.

**Timezone (IST).** Every timestamp stored in DuckDB is a naive datetime in **IST (UTC+5:30)** wall-clock, written via `now_ist()` so it's correct regardless of host timezone. Filters compare against an IST "now", and the API serialises with the `+05:30` offset so the dashboard shows correct local times. (The raw OSM edit timestamp stays UTC — it's authoritative upstream data.)

**Cloud archive & visitor logging (optional, Azure Blob).** Set `AZURE_STORAGE_CONNECTION_STRING` + `AZURE_BLOB_CONTAINER` and two extra writers switch on, both best-effort and disabled when unset. The processor archives the silver and gold layers hourly as a time-partitioned history (`silver/dt=YYYY-MM-DD/HH.parquet`, `gold/dt=…`), and the API flushes one JSON summary line per hour to `logs/visits-YYYY-MM-DD.log` — `unique_visitors` (distinct IP hashes) for "how many people", plus each visitor's IP hash + user-agent. The dashboard fires a one-shot beacon per page load and its proxy forwards the visitor IP taken from Vercel's **trusted `x-real-ip`** (non-spoofable) — **not** the forgeable client-supplied `X-Forwarded-For`. The raw IP is then **immediately hashed** (`HMAC-SHA256` keyed on a per-process `os.urandom(32)` salt, truncated to 16 hex chars and never persisted), so the buffer and the blob store `ip_hash` only — **no raw IP is ever stored**, keeping the log free of personal data under GDPR while still answering "how many distinct people." Azure credentials live only on the VM, never on Vercel.

The same container also **reads** two small text files — `updates/whats_new.txt` and `updates/whats_coming.txt` (one line = one bullet). The API refreshes them into memory every 60 s (`api/updates.py`) and serves them inline on `/stats`, so the dashboard's **What's new** / **What's coming** header buttons update live without a redeploy. Empty when Azure is unconfigured.

**Security posture.** The API serves public, read-only data; all user-supplied query parameters are bound (`?`) and clamped by FastAPI validation — never string-interpolated into SQL. No secrets are hardcoded (GDELT/OpenAI keys come from the environment). Because the API runs without a reverse proxy, access is gated in-app: a central middleware (`api/auth.py`) requires the shared `TRACK_SECRET` (sent by the dashboard proxy as `x-track-secret`) on **every** endpoint except `/health`, so the API is reachable only through the dashboard proxy — a client hitting `:8000` directly is refused with a 404. `POST /track` is additionally rate-limited (60/min per IP). Setting `TRACK_SECRET` locks the API down; leaving it unset opens all endpoints for local dev. This open state is **fail-closed in production**: with `APP_ENV=production` the API refuses to start unless `TRACK_SECRET` is set (it raises before uvicorn binds), so a public deployment can never come up with the gate silently disabled; `APP_ENV` defaults to `development`, where an open API is intentional. Optionally terminate TLS in uvicorn and restrict the VM port via the Azure NSG.

---

## Limitations & roadmap

Everything runs on one Azure B1ms VM — 1 vCPU, 2 GB RAM — and I built it to work within that budget rather than around it. What's missing is missing for one of two reasons: I'd need more hardware, or I chose to keep v1 simple.

**Where the single VM constrains me**

- Poller, processor, API, and Redis share one box — a single point of failure with no headroom. The pipeline is built to shard (Redis consumer groups already give at-least-once delivery); I just don't have a second node to run the consumers on.
- Baselines only reach back 7 days. Bronze (3-day) and Silver (8-day) retention is what keeps memory and disk under 2 GB — enough for hour-of-day seasonality, not weekly or holiday patterns. Extending it is a storage cost, not a rewrite.

**Choices I made for v1**

- I attribute each edit to the nearest named place rather than a hex grid. It's coarser near borders, but I get "Gaziantep, Türkiye" instead of a cell ID — and that readable name is what feeds the AI explanation, the news matching, and the dashboard. H3 would give cleaner buckets, but the cells still need geocoding to be labelled, so place-names-first was the right trade for a v1 that needs to flag a surge and name where.
- Detection thresholds are fixed values I tuned by hand, and the baseline only models hour-of-day — no day-of-week or holiday awareness yet. Simple, and easy to reason about while I watch how it behaves against real events.

**What's next**

- **Push alerts** — the next build, and a small one. A surge already lands in `gold_surges`; I fire one HTTP call at that write to a Telegram or Discord channel, so people get a sub-minute ping instead of polling the dashboard. Broadcasting to a channel costs nothing per subscriber and adds no background process, so it fits the VM as-is — the work is message formatting and dedup, not infra.
- **Longer, richer baselines** — more history plus day-of-week and holiday seasonality, once I have the RAM and disk to hold and rebuild a wider window.
- **Surge archive** — I already write Gold and Silver to Blob hourly, so I want a read-only view to open any past surge and see the map, headlines, explanation, and the ramp that preceded it. It doubles as a record of the real events the system has caught.
- **Finer geography** — H3 hex binning for sharper localization and cleaner overlays, once precise boundaries matter more than readable names.
- **Scaling out** — shard the stream across processor instances and move serving onto object storage.

---

## Further reading

📐 **[ARCHITECTURE.md](ARCHITECTURE.md)** — a module-by-module walkthrough of every component, the exact data schemas (Redis Streams, DuckDB tables, Parquet snapshots), the serialization conventions, and the surge-detection math.
