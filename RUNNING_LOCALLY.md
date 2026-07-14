# Running OSM Surge Tracker locally

## Prerequisites

| Requirement | Check |
|---|---|
| Python 3.13 | `python --version` |
| Node.js 18+ (for the dashboard) | `node --version` |
| Docker Desktop (running) | `docker info` |
| OSM Surge repo cloned | you're reading this |

---

## One-time setup

### 1. Fill in your secrets (optional)

Edit `src/secret.env` — the only two values that matter are the API keys, and **both are optional**. Without them the system runs fine; surges are just recorded with no news headlines / no AI explanation.

```
GDELT_API_KEY=<your key from gdeltcloud.com — enables news via the Events API>
OPENAI_API_KEY=<your key from platform.openai.com>
```

`PROCESSOR_START_ID=$` is set in the file, meaning the processor consumes only **new** edits (the right choice for a live dashboard). Use `0` only on a fresh/empty Redis stream — on an accumulated stream it replays hundreds of thousands of stale edits and the processor looks "stuck" for many minutes. (See Troubleshooting → "processor seems stuck".)

`AZURE_STORAGE_CONNECTION_STRING` and `AZURE_BLOB_CONTAINER` are also **optional** and **blank by default** — leave them empty for normal local development and nothing changes (the processor and API each log one "Azure Blob not configured" line and skip cloud writes). Fill them in only to exercise the cloud features (hourly silver/gold archive + hourly visitor log); see *Testing the Azure Blob features* below.

> ⚠️ Never commit real keys. `secret.env` should stay out of version control.

### 2. Create and activate the virtual environment

```powershell
cd path\to\osm_surge\src
python -m venv osm
.\osm\Scripts\activate
```

### 3. Install all dependencies

```powershell
pip install -r requirements.txt
```

> **Note:** You only need to do steps 2–3 once. After that, just activate the venv (`.\osm\Scripts\activate`) each session.

### 4. Start Redis

```powershell
docker run -d -p 6379:6379 --name osm-redis redis:7
```

If you see `port is already allocated`, Redis is already running — skip this step.

Verify: `docker exec osm-redis redis-cli ping` → should print `PONG`.

---

## Running the system

Open **4 separate PowerShell terminals**. In each one:

```powershell
cd path\to\osm_surge\src
.\osm\Scripts\activate
```

> The entry points auto-load `secret.env` via python-dotenv, so you do **not** need to set environment variables manually in the shell.

---

### Terminal 1 — Poller

```powershell
cd poller
python poller.py
```

**What to expect:**
```
2026-06-20T10:00:00Z INFO No local state — bootstrapping at seq=6123456
2026-06-20T10:01:00Z INFO seq=6123457: 1842 events pushed to Redis
2026-06-20T10:02:00Z INFO seq=6123458: 2103 events pushed to Redis
```
A new sequence number arrives every ~60 seconds (OSM publishes minutely diffs). The poller downloads each `.osc.gz` file, parses every node/way/relation, and pushes them to the `osm:raw` Redis Stream.

---

### Terminal 2 — Processor

```powershell
cd processor
python processor.py
```

**What to expect (first minute):**
```
INFO  Connecting to Redis at localhost:6379
INFO  Opening DuckDB
INFO  DuckDB tables ready ...
INFO  Pre-loading geocoder database — first run can take ~30s…
Loading formatted geocoded file...
INFO  Geocoder ready
INFO  Starting all coroutines (start_id=$)
```

The processor runs **8 async coroutines** and is intentionally quiet at INFO level once steady — *the absence of logs does not mean it's stuck.* Notes:
- **Geocoder pre-warm (~30 s)** happens on startup before any coroutine runs; the first Parquet snapshot lands shortly after `Geocoder ready`.
- `SURGE detected` (a WARNING) appears once baselines build (~7 days), or immediately via the cold-start fallback if a region spikes hard.
- To confirm it's alive without logs, watch the snapshot files refresh: `ls path\to\osm_surge\data\api\` (timestamps update every ~60 s) or `docker exec osm-redis redis-cli XINFO GROUPS osm:raw` (entries-read climbs).

---

### Terminal 3 — API

```powershell
# Run from src/ — the api package must be importable
python -m api.main
```

**What to expect:**
```
INFO  uvicorn.error — Application startup complete.
INFO  Started server process
INFO  Waiting for application startup.
INFO  Application startup complete.
```

Smoke-test the API (run in any terminal):

```powershell
# Basic health check
curl http://localhost:8000/health

# Stats (will show zeros until the processor has run for ~60s)
curl http://localhost:8000/stats

# Active surges
curl http://localhost:8000/surges/active

# Heatmap (populated after first Parquet snapshot)
curl http://localhost:8000/heatmap

# History with filters
curl "http://localhost:8000/surges/history?days=7&min_magnitude=3.0"
```

Expected `/health` response:
```json
{"status": "ok", "timestamp": "2026-06-20T10:05:00.123456+00:00"}
```

Expected `/stats` before any data:
```json
{"total_surges_today": 0, "countries_affected": 0, "highest_magnitude_today": null, "edits_last_hour": 0}
```

After ~60s of processor running, `/stats` will show real edit counts.

---

### Terminal 4 — Dashboard

The dashboard is a Next.js app in `dashboard-web/`. First time only, install deps:

```powershell
cd dashboard-web
npm install
```

By default the dashboard's server-side proxy targets `http://localhost:8000`. To point
it elsewhere, create `dashboard-web/.env.local` with `API_BASE_URL=...`. Then run:

```powershell
npm run dev
```

Open `http://localhost:3000`.

**What to expect:**
- The dark dashboard loads with 4 metric tiles all showing `0`
- The map renders (dark basemap) with empty layers
- The surge feed shows "No active surges detected"
- Every 60 seconds the data refreshes in-place (SWR polling — no full reload)
- Once the processor's first Parquet snapshot lands (`data/api/*.parquet`), `/stats` populates and the heatmap starts filling in

---

## Timing expectations

| Time after start | What happens |
|---|---|
| 0–30s | Poller bootstraps; processor connects and **pre-warms the geocoder** (~30 s) |
| ~30–90s | First Parquet snapshot written; `/heatmap` and `/stats` return real data. Until then the API logs "Snapshot(s) not ready" and serves empty results — this is normal |
| ~5 min | Bronze table has enough rows that geocoding patterns are visible on the map |
| ~7 days | Baselines established; z-score anomaly detection becomes active |
| Any time | Cold-start fallback fires surges immediately if any region exceeds 2× the P95 of multi-mapper edit volume |

> All displayed times (dashboard header, surge "ago", history) are **IST (UTC+5:30)**.

---

## Testing the Azure Blob features (optional)

The silver/gold archive and the visitor log are **off** unless `AZURE_STORAGE_CONNECTION_STRING`
and `AZURE_BLOB_CONTAINER` are set. To try them locally without a real storage account, use the
**Azurite** emulator:

```powershell
# 1. Run Azurite (Docker) — exposes the blob service on localhost:10000
docker run -d -p 10000:10000 --name azurite mcr.microsoft.com/azure-storage/azurite azurite-blob --blobHost 0.0.0.0

# 2. In secret.env, set the well-known Azurite dev connection string + a container name:
#    AZURE_STORAGE_CONNECTION_STRING=UseDevelopmentStorage=true
#    AZURE_BLOB_CONTAINER=osm-surge
```

Then:

1. **Install the SDK** (already in the component requirements — re-run if you set up the venv earlier):
   `pip install -r requirements.txt`.
2. **Restart the processor and API** so they pick up the new env vars. Each logs a line confirming the
   feature is enabled (`Silver/gold hourly Azure Blob archive enabled` / `Hourly visitor logging to Azure Blob enabled`).
3. **Visitor log:** first set the **same** `TRACK_SECRET` in both `src/secret.env` (read by the API)
   and `src/dashboard-web/.env.local` (read by the proxy) — without it the API drops every beacon
   (fail-closed) and nothing is logged. **Heads-up:** `TRACK_SECRET` now also gates the *read*
   endpoints — when it's set on the API, requests without a matching `x-track-secret` get a 404, so
   the value **must match on both sides** or the dashboard's data calls will fail too. (Unset on both
   = the whole API is open, which is the frictionless local default — allowed only because
   `APP_ENV` defaults to `development`. On a public deploy set `APP_ENV=production`, which makes
   the API **refuse to start** without `TRACK_SECRET` so it can't come up open by accident.)
   Generate one with
   `python -c "import secrets;print(secrets.token_urlsafe(32))"`, restart the API and the Next dev
   server, then load the dashboard (`http://localhost:3000`). The browser fires `POST /api/track`,
   which the proxy forwards (with the secret + the real client IP as `x-client-ip`) to the API's
   `POST /track` (the API logs a 204). Open a second browser/incognito window to register a distinct
   visitor. Note the beacon is rate-limited to 60/min per client IP.
4. **Archives + log are written on the hour boundary.** Both loops flush once per hour, so to see output
   quickly either wait for the next `HH:00`, or temporarily shorten the wait while testing:
   - in `processor/blob_uploader.py` → `archive_loop`, and `api/visitors.py` → `flush_loop`, replace the
     "sleep until next hour" line with `await asyncio.sleep(60)` and slice the last minute instead of the
     last hour. **Revert this before committing.**
5. **Inspect the container** with Azure Storage Explorer (connect to the local emulator) or the Azure CLI
   against Azurite. Expect `silver/dt=…/HH.parquet`, `gold/dt=…/HH.parquet`, and
   `logs/visits-YYYY-MM-DD.log` (one JSON line per flush, whose `visitors[].ip_hash` is a salted HMAC of the client IP — no raw IP is stored).

> Against a **real** Azure account, just paste the account's connection string (Portal → *Access keys →
> Connection string*) and a container name into `secret.env` — the container is auto-created if missing.
> Cloud writes require outbound HTTPS (443), which is open by default.

---

### "I configured Azure but see no files" — make them appear in ~1 minute

You have a **real** account configured (`AZURE_STORAGE_CONNECTION_STRING` + `AZURE_BLOB_CONTAINER`
set in `secret.env`), but the container is empty. This is **expected**, not a bug: both writers
flush **once per hour, on the hour**, so the very first file can be up to ~60 minutes away. To
force them out immediately, do the following.

**Step A — confirm the feature is actually ON.** Restart the **processor** and **API** *after*
setting the env vars, and look for these startup lines. If instead you see "Azure Blob *not*
configured", the vars aren't being loaded (check for typos / stray quotes in `secret.env`):

```
# processor terminal:
INFO  Silver/gold hourly Azure Blob archive enabled
# API terminal:
INFO  Hourly visitor logging to Azure Blob enabled
```

**Step B — temporarily flush every minute (TEST ONLY — revert before committing).**
Make these two edits, then restart the processor and API.

1. `processor/blob_uploader.py` → `archive_loop`, replace the "sleep until next top-of-hour"
   block with a 1-minute loop over the last 10 minutes:

   ```python
   while True:
       await asyncio.sleep(60)                       # TEST: every minute, not hourly
       now = now_ist()
       hour_end   = now
       hour_start = now - timedelta(minutes=10)      # TEST: last 10 min, not last hour
       try:
   ```

2. `api/visitors.py` → `flush_loop`, replace its "sleep until next top-of-hour" block:

   ```python
   while True:
       await asyncio.sleep(60)                       # TEST: every minute, not hourly
       hour_start = now_ist()
       summary = _build_and_reset(hour_start.isoformat())
   ```

**Step C — generate a visitor row** (for the log): open the dashboard at `http://localhost:3000`
(and a second incognito window for a distinct visitor). Each load fires `POST /track`.

**Step D — wait ~60–90 s, then look in the container.** You should now see:

```
<container>/silver/YYYY-MM-DD/HH.parquet     ← from the processor (refreshed each minute)
<container>/gold/YYYY-MM-DD/HH.parquet        ← from the processor (often a zero-row file —
                                                   surges are rare; the file still appears)
<container>/logs/visits-YYYY-MM-DD.log           ← from the API (one JSON line per minute now)
```

Inspect with the Azure Portal (*Storage account → Containers → your container*), **Azure Storage
Explorer**, or the CLI:

```powershell
az storage blob list --account-name <ACCOUNT> --container-name <CONTAINER> --output table
# or, using the same connection string the app uses:
az storage blob list --connection-string "<your connection string>" --container-name <CONTAINER> --output table
```

> **Notes & gotchas**
> - `silver`/`gold` files appear even with **no data** — `COPY` of an empty result still writes a
>   valid zero-row Parquet, so an empty file is normal early on, not a failure.
> - `gold` will usually be empty until a surge fires (7-day baselines, or the cold-start fallback).
> - The blob "folders" (`silver/`, `gold/`, `logs/`) are virtual — Azure Blob is a flat namespace;
>   the `/` in the blob name just renders as folders in the Portal.
> - **Revert Step B before committing** (restore the top-of-hour sleep) — the 1-minute cadence is
>   only for verification.

---

---

## Troubleshooting

**`OPENAI_API_KEY` / `GDELT_API_KEY` missing warning**

The entry points auto-load `secret.env` at startup. If you still see this warning, check:
1. The keys are actually set (not left as `your_openai_api_key_here`) in `src/secret.env`
2. You're running from the correct directory (the path resolution expects `secret.env` to be two levels up from the entry point)

Both keys are optional — the system runs without them; surges will be recorded with empty `explanation` and `news_headlines`.

**`Cannot connect to Redis`**

```powershell
docker ps | grep 6379          # is the container running?
docker start osm-redis         # if it exists but is stopped
docker run -d -p 6379:6379 --name osm-redis redis:7   # if it doesn't exist yet
```

**`No module named 'api'` when starting the API**

You must run the API from `src/`, not from inside `src/api/`:
```powershell
cd path\to\osm_surge\src
python -m api.main
```

**Parquet files not appearing**

The processor writes to `data/api/` relative to the repo root (two levels above `src/`). Check:
```powershell
ls path\to\osm_surge\data\api\
```
If the directory doesn't exist after 60s of the processor running, check the processor logs for snapshot errors.

**Dashboard shows stale data / "Live data unavailable"**

The API must be running (`Terminal 3`) before the dashboard can fetch data. The dashboard degrades gracefully — it shows a warning banner instead of crashing.

**API logs "Snapshot(s) not ready" / endpoints return empty**

Normal for the first ~30–90 s after the processor starts (geocoder pre-warm + first snapshot). If it persists: confirm the processor is running and `data/api/*.parquet` exists. Make sure `API_PARQUET_DIR` is **not** set to an empty value in `secret.env` (a blank `API_PARQUET_DIR=` line breaks the path — leave it commented out).

**Processor seems stuck (no logs after "Starting all coroutines")**

It's almost certainly working — `consume_and_enrich` logs nothing on success. If you set `PROCESSOR_START_ID=0` on a stream that already holds a large backlog, it replays everything (hundreds of thousands of edits) and appears frozen for many minutes. Check progress with `docker exec osm-redis redis-cli XINFO GROUPS osm:raw` (watch `lag`). To skip the backlog and jump to live edits:
```powershell
docker exec osm-redis redis-cli XGROUP SETID osm:raw processor-group $
```

**Dashboard changes not showing after editing code**

`npm run dev` hot-reloads on save. If a change to the proxy route or `API_BASE_URL`
doesn't take effect, stop it (Ctrl+C) and re-run `npm run dev` so the new environment is
picked up. Note: editing `.env.local` requires a dev-server restart.

**Dashboard shows "Live data unavailable" / empty data**

The proxy (and therefore the dashboard) targets `API_BASE_URL` (default
`http://localhost:8000`). Confirm the API is running (Terminal 3) and that
`dashboard-web/.env.local`, if present, points at the right URL. The dashboard degrades
gracefully — it shows a banner instead of crashing.

---

## Stopping everything

```powershell
# In each terminal: Ctrl+C

# Stop Redis (optional — it persists data in the container)
docker stop osm-redis
```
