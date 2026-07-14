"""
Stats endpoint: the four global numbers shown in the dashboard header. Combines
the gold snapshot (surge counts) with the bronze-recent snapshot (edit throughput).
"""

from datetime import timedelta

import duckdb
from fastapi import APIRouter, Depends, Request

from api import updates
from api.db import query_one
from api.models import StatsResponse
from api.timeutil import now_ist

router = APIRouter(tags=["stats"])

# Four aggregates in one row via scalar subqueries: three over gold_surges (last 24h
# — surge count, countries, peak magnitude) and one over bronze_raw_edits (last 1h,
# edit throughput). highest_magnitude_today is NULL with no surges (the model allows
# it). "?" order: the 24h cutoff three times, then 1h.
_STATS_SQL = """
SELECT
    (SELECT COUNT(*)
     FROM gold_surges
     WHERE detected_at >= ?) AS total_surges_today,
    (SELECT COUNT(DISTINCT country_code)
     FROM gold_surges
     WHERE detected_at >= ?) AS countries_affected,
    (SELECT MAX(surge_magnitude)
     FROM gold_surges
     WHERE detected_at >= ?) AS highest_magnitude_today,
    (SELECT COUNT(*)
     FROM bronze_raw_edits
     WHERE processed_at >= ?) AS edits_last_hour
"""


def _get_db(request: Request) -> duckdb.DuckDBPyConnection:
    return request.app.state.db


@router.get("", response_model=StatsResponse)
async def get_stats(
    conn: duckdb.DuckDBPyConnection = Depends(_get_db),
) -> StatsResponse:
    now = now_ist()
    cutoff_24h = now - timedelta(hours=24)
    cutoff_1h = now - timedelta(hours=1)
    row = query_one(conn, _STATS_SQL, [cutoff_24h, cutoff_24h, cutoff_24h, cutoff_1h])
    # None only if snapshots are missing or the query errored — fall back to zeros
    # so the header still renders.
    resp = StatsResponse() if row is None else StatsResponse.model_validate(row)
    # The update lists ride along on the stats the dashboard already polls (no extra
    # endpoint). Read from the Blob-backed cache refreshed by api/updates.py.
    resp.whats_new = updates.whats_new
    resp.whats_coming = updates.whats_coming
    return resp
