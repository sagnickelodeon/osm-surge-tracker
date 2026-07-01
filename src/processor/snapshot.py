"""
API snapshot exporter.

DuckDB allows only one process to hold a file open read-write, and the processor
holds that lock for life — so the API can't open the .duckdb file at all. To break
the deadlock, the processor (the lock holder) exports the API's tables to Parquet;
the API reads those with its own lock-free in-memory connection.

Read-only and additive: this never touches the processor's write path.
"""

import asyncio
import logging
import os
from pathlib import Path

import duckdb

logger = logging.getLogger(__name__)

# Refresh cadence — matches the dashboard's, so data is never >~1 min stale.
SNAPSHOT_INTERVAL = 60

# Snapshots live alongside the main database, under data/api/.
PARQUET_DIR = Path(__file__).parent.parent.parent / "data" / "api"

# (output filename, source query), one Parquet file each. We export narrow slices
# rather than full tables: gold is tiny, but silver is capped at 48h (heatmap needs
# 24h) and bronze to just processed_at over 2h (all /stats needs).
_EXPORTS: list[tuple[str, str]] = [
    (
        "gold_surges.parquet",
        "SELECT * FROM gold_surges",
    ),
    (
        "silver_windowed_edits.parquet",
        "SELECT * FROM silver_windowed_edits "
        "WHERE window_start >= (NOW() AT TIME ZONE 'Asia/Kolkata') - INTERVAL '48 hours'",
    ),
    (
        "bronze_recent.parquet",
        "SELECT processed_at FROM bronze_raw_edits "
        "WHERE processed_at >= (NOW() AT TIME ZONE 'Asia/Kolkata') - INTERVAL '2 hours'",
    ),
]


def _export_parquet(conn: duckdb.DuckDBPyConnection) -> None:
    """
    Write each table slice to Parquet atomically.

    COPY writes a temp file; os.replace swaps it in atomically, so a reader never
    sees a half-written file. An empty result still yields a valid zero-row Parquet
    with the right schema, so the API works before any data exists.
    """
    PARQUET_DIR.mkdir(parents=True, exist_ok=True)

    for fname, sql in _EXPORTS:
        final = PARQUET_DIR / fname
        tmp = PARQUET_DIR / f"{fname}.tmp"
        # as_posix() yields forward slashes, which DuckDB accepts on Windows too.
        conn.execute(f"COPY ({sql}) TO '{tmp.as_posix()}' (FORMAT PARQUET)")
        try:
            os.replace(tmp, final)
        except OSError:
            # On Windows the swap can fail if a reader has the file open. Harmless —
            # the next cycle overwrites the .tmp and retries, so it self-heals.
            logger.warning("Could not swap snapshot %s (reader busy?) — will retry", fname)


async def snapshot_loop(conn: duckdb.DuckDBPyConnection) -> None:
    """Refresh the API Parquet snapshots every SNAPSHOT_INTERVAL seconds, forever."""
    while True:
        try:
            _export_parquet(conn)
            logger.debug("API Parquet snapshots refreshed in %s", PARQUET_DIR)
        except Exception:
            logger.exception("Snapshot export failed")
        await asyncio.sleep(SNAPSHOT_INTERVAL)
