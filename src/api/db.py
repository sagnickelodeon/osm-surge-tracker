"""
Database access layer for the read-only API.

DuckDB allows only one process to hold a file open read-write, and the processor
holds that lock for life — so this API can't open the .duckdb file at all. Instead
the processor exports the tables to Parquet (processor/snapshot.py) and we query
those here through a single in-memory connection:

  - `:memory:` never touches the locked file, so it always opens and any number of
    workers can run side by side.
  - Each query (re)creates a VIEW per table over the current Parquet file via
    read_parquet(), so we always serve the latest snapshot; atomic swaps keep it
    consistent.
  - Helpers swallow errors and return empty results — a missing snapshot yields
    [] / None (rendered as an empty state), so the API never 500s.
"""

import logging
import os
from pathlib import Path

import duckdb

logger = logging.getLogger(__name__)

# Snapshot dir (written by processor/snapshot.py). Defaults to <repo>/data/api;
# override on the VM via API_PARQUET_DIR.
_DEFAULT_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "api"
# `or`, not a default arg: a blank API_PARQUET_DIR= loads as "" and must fall back
# to the default rather than becoming a broken relative path.
PARQUET_DIR: str = os.environ.get("API_PARQUET_DIR") or str(_DEFAULT_DIR)

# Logical table name -> snapshot filename. Route SQL uses the logical names; the
# views below map them onto the Parquet files.
_VIEWS: dict[str, str] = {
    "gold_surges": "gold_surges.parquet",
    "silver_windowed_edits": "silver_windowed_edits.parquet",
    "bronze_raw_edits": "bronze_recent.parquet",
}


def get_connection() -> duckdb.DuckDBPyConnection:
    """Open the in-memory DuckDB connection used for the API's lifetime."""
    return duckdb.connect(":memory:")


def _refresh_views(conn: duckdb.DuckDBPyConnection) -> None:
    """
    Point each logical view at its current Parquet snapshot.

    Cheap per query (just re-parses a tiny DDL) and keeps views in sync as snapshots
    appear or swap. Missing files are skipped; querying a still-missing view raises,
    which the helpers catch as an empty result.
    """
    missing: list[str] = []
    for view, fname in _VIEWS.items():
        path = os.path.join(PARQUET_DIR, fname)
        if not os.path.exists(path):
            missing.append(view)
            continue
        # Paths are operator-controlled, but escape quotes defensively. User filter
        # values never reach here — they go through bound "?" params in the route SQL.
        safe_path = path.replace("'", "''")
        try:
            conn.execute(
                f"CREATE OR REPLACE VIEW {view} AS "
                f"SELECT * FROM read_parquet('{safe_path}')"
            )
        except Exception:
            logger.exception("Failed to (re)create view %s", view)

    # Absent snapshots (before the processor's first export) are an expected
    # "warming up" state — one concise warning beats a per-request stack trace.
    if missing:
        logger.warning(
            "Snapshot(s) not ready: %s — is the processor running? "
            "Serving empty results until the first export lands.",
            ", ".join(missing),
        )


def query(
    conn: duckdb.DuckDBPyConnection,
    sql: str,
    params: list | None = None,
) -> list[dict]:
    """Run a SELECT and return a list of row dicts. Returns [] on any error."""
    try:
        _refresh_views(conn)
        cursor = conn.execute(sql, params or [])
        col_names = [d[0] for d in cursor.description]
        rows = cursor.fetchall()
        return [dict(zip(col_names, row)) for row in rows]
    except duckdb.CatalogException:
        # Snapshot not written yet — expected while the processor warms up, and
        # already logged by _refresh_views. No stack trace needed.
        return []
    except Exception:
        logger.exception("DuckDB query failed: %s", sql[:120])
        return []


def query_one(
    conn: duckdb.DuckDBPyConnection,
    sql: str,
    params: list | None = None,
) -> dict | None:
    """Run a SELECT expected to return one row. Returns None on empty/error."""
    try:
        _refresh_views(conn)
        cursor = conn.execute(sql, params or [])
        col_names = [d[0] for d in cursor.description]
        row = cursor.fetchone()
        if row is None:
            return None
        return dict(zip(col_names, row))
    except duckdb.CatalogException:
        # Snapshot not ready yet — degrade quietly (see _refresh_views).
        return None
    except Exception:
        logger.exception("DuckDB query_one failed: %s", sql[:120])
        return None
