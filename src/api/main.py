"""
Component 3a — read-only JSON API over the processor's Parquet snapshots.

Every endpoint is a single query plus serialisation; no business logic here.
Run: `python -m api.main` (from src/) or `uvicorn api.main:app --port 8000`.
Env: API_PARQUET_DIR — snapshot dir (default: <repo>/data/api).
"""

import asyncio
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
load_dotenv(Path(__file__).parent.parent / "secret.env", override=False)

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from api import updates, visitors
from api.auth import SecretGateMiddleware
from api.db import get_connection
from api.models import HealthResponse
from api.ratelimit import limiter
from api.routes import heatmap, stats, surges, track

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s — %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    One shared in-memory DuckDB connection for the process lifetime.

    Every endpoint is async and a DuckDB query never yields mid-run, so requests
    can't interleave on the connection — no pool or lock needed. In-memory also
    never contends with the processor's file lock.
    """
    logger.info("Opening in-memory DuckDB connection")
    app.state.db = get_connection()
    # Hourly visitor-log flush to Azure Blob (no-op if unconfigured).
    app.state.flush_task = asyncio.create_task(visitors.flush_loop())
    # Refresh the What's-new/coming lists from Blob every 60s (no-op if unconfigured).
    app.state.updates_task = asyncio.create_task(updates.refresh_loop())
    logger.info("API ready")
    yield
    for task in (app.state.flush_task, app.state.updates_task):
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass
    app.state.db.close()
    logger.info("DuckDB connection closed")


app = FastAPI(
    title="OSM Surge Tracker API",
    description="Read-only API for OSM mapping surge data",
    version="1.0.0",
    lifespan=lifespan,
)

# App-level rate limiting (no reverse proxy). slowapi needs the limiter on app.state
# and its 429 handler registered; only POST /track is decorated.
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Access gate: when TRACK_SECRET is set, every endpoint but /health requires it.
# Added before CORS so it runs as the outer layer. See api/auth.py.
app.add_middleware(SecretGateMiddleware)

# Vestigial with the gate on (the only caller is the server-side proxy, which
# ignores CORS). Kept permissive for direct browser probing in open dev mode.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET"],
    allow_headers=["*"],
)

app.include_router(surges.router, prefix="/surges")
app.include_router(heatmap.router, prefix="/heatmap")
app.include_router(stats.router, prefix="/stats")
app.include_router(track.router, prefix="/track")


@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    """Liveness probe for systemd/uptime checks. Never touches the DB."""
    return HealthResponse(
        status="ok",
        timestamp=datetime.now(timezone.utc).isoformat(),
    )


if __name__ == "__main__":
    # 0.0.0.0 so the dashboard can reach the VM. Front with TLS in production.
    uvicorn.run("api.main:app", host="0.0.0.0", port=8000, log_level="info")
