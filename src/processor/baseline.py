import asyncio
import logging
from datetime import datetime, timezone

import duckdb

logger = logging.getLogger(__name__)


def _recalculate_baselines(conn: duckdb.DuckDBPyConnection) -> int:
    conn.execute("BEGIN")
    conn.execute("DELETE FROM baselines")
    conn.execute("""
        INSERT INTO baselines
        SELECT
            country_code,
            admin_region,
            CAST(DATE_PART('hour', window_start) AS INTEGER) AS hour_of_day,
            AVG(edit_count)    AS baseline_mean,
            STDDEV(edit_count) AS baseline_std,
            COUNT(*)           AS sample_count,
            -- Naive IST to match the IST wall-clock stored in window_start.
            NOW() AT TIME ZONE 'Asia/Kolkata'              AS computed_at
        FROM silver_windowed_edits
        WHERE window_start >= (NOW() AT TIME ZONE 'Asia/Kolkata') - INTERVAL '7 days'
          AND country_code IS NOT NULL
        GROUP BY 1, 2, 3
    """)
    row_count = conn.execute("SELECT COUNT(*) FROM baselines").fetchone()[0]
    conn.execute("COMMIT")
    return row_count


async def update_baselines_loop(conn: duckdb.DuckDBPyConnection) -> None:
    while True:
        try:
            n = _recalculate_baselines(conn)
            logger.info(
                "Baselines recalculated at %s: %d region×hour rows",
                datetime.now(timezone.utc).isoformat(),
                n,
            )
        except Exception:
            logger.exception("Baseline recalculation failed")

        await asyncio.sleep(3600)
