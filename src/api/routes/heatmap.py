"""
Heatmap endpoint: edit density per region over the last 24 hours, used as the
background layer of the dashboard map. Reads from the silver snapshot.
"""

from datetime import timedelta

import duckdb
from fastapi import APIRouter, Depends, Request

from api.db import query
from api.models import HeatmapPoint
from api.timeutil import now_ist

router = APIRouter(tags=["heatmap"])

# Sum edits per region over 24h, averaging per-window centroids into one point.
# Rows without a centroid (the null-coordinate bucket) have nowhere to draw — skip them.
_HEATMAP_SQL = """
SELECT
    country_code,
    admin_region,
    SUM(edit_count)   AS total_edits,
    AVG(centroid_lat) AS centroid_lat,
    AVG(centroid_lon) AS centroid_lon
FROM silver_windowed_edits
WHERE window_start >= ?
  AND centroid_lat IS NOT NULL
  AND centroid_lon IS NOT NULL
GROUP BY country_code, admin_region
ORDER BY total_edits DESC
"""


def _get_db(request: Request) -> duckdb.DuckDBPyConnection:
    return request.app.state.db


@router.get("", response_model=list[HeatmapPoint])
async def get_heatmap(
    conn: duckdb.DuckDBPyConnection = Depends(_get_db),
) -> list[HeatmapPoint]:
    cutoff = now_ist() - timedelta(hours=24)
    rows = query(conn, _HEATMAP_SQL, [cutoff])
    return [HeatmapPoint.model_validate(r) for r in rows]
