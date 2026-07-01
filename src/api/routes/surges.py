"""
Surge endpoints: the live feed (/surges/active) and the historical log
(/surges/history). Both read from the gold_surges snapshot.
"""

from datetime import timedelta

import duckdb
from fastapi import APIRouter, Depends, Query, Request

from api.db import query
from api.models import SurgeResponse
from api.timeutil import now_ist

# Registered under prefix="/surges" in main.py, so the routes below resolve to
# /surges/active and /surges/history.
router = APIRouter(tags=["surges"])

# "Currently happening": active status, detected in the last 2h, strongest first.
# Cutoff bound as a naive-IST param (see timeutil) to match stored timestamps.
_ACTIVE_SQL = """
SELECT *
FROM gold_surges
WHERE status = 'active'
  AND detected_at >= ?
ORDER BY surge_magnitude DESC
"""

# Historical log. "(? IS NULL OR country_code = ?)" makes the country filter optional
# in a single query — a NULL country_code skips the clause, no string-building.
_HISTORY_SQL = """
SELECT *
FROM gold_surges
WHERE detected_at >= ?
  AND (? IS NULL OR country_code = ?)
  AND surge_magnitude >= ?
ORDER BY detected_at DESC
LIMIT ?
"""


def _get_db(request: Request) -> duckdb.DuckDBPyConnection:
    """The shared in-memory connection opened in main.py's lifespan."""
    return request.app.state.db


@router.get("/active", response_model=list[SurgeResponse])
async def get_active_surges(
    conn: duckdb.DuckDBPyConnection = Depends(_get_db),
) -> list[SurgeResponse]:
    cutoff = now_ist() - timedelta(hours=2)
    rows = query(conn, _ACTIVE_SQL, [cutoff])
    return [SurgeResponse.model_validate(r) for r in rows]


@router.get("/history", response_model=list[SurgeResponse])
async def get_surge_history(
    # FastAPI clamps these, then they're passed as bound params (never interpolated).
    days: int = Query(default=7, ge=1, le=90),
    country_code: str | None = Query(default=None),
    min_magnitude: float = Query(default=3.0, ge=0.0),
    limit: int = Query(default=100, ge=1, le=1000),
    conn: duckdb.DuckDBPyConnection = Depends(_get_db),
) -> list[SurgeResponse]:
    # Cutoff computed in Python (naive IST) rather than a DuckDB INTERVAL string —
    # fully parameterised and matches the stored IST timestamps.
    cutoff = now_ist() - timedelta(days=days)
    rows = query(conn, _HISTORY_SQL, [cutoff, country_code, country_code, min_magnitude, limit])
    return [SurgeResponse.model_validate(r) for r in rows]
