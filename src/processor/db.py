import logging
import os
from pathlib import Path

import duckdb

DB_PATH = Path(__file__).parent.parent.parent / "data" / "osm_surge.duckdb"

logger = logging.getLogger(__name__)


def get_connection() -> duckdb.DuckDBPyConnection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    return duckdb.connect(str(DB_PATH))


def create_tables(conn: duckdb.DuckDBPyConnection) -> None:
    conn.execute("""
        CREATE TABLE IF NOT EXISTS bronze_raw_edits (
            event_id        VARCHAR,
            sequence_number INTEGER,
            timestamp       TIMESTAMP,
            edit_type       VARCHAR,
            osm_type        VARCHAR,
            osm_id          BIGINT,
            lat             DOUBLE,
            lon             DOUBLE,
            changeset_id    BIGINT,
            user            VARCHAR,
            tags            JSON,
            country_code    VARCHAR,
            country_name    VARCHAR,
            admin_region    VARCHAR,
            place_name      VARCHAR,
            has_coords      BOOLEAN,
            processed_at    TIMESTAMP
        )
    """)

    conn.execute("""
        CREATE TABLE IF NOT EXISTS silver_windowed_edits (
            window_start TIMESTAMP,
            window_end   TIMESTAMP,
            country_code VARCHAR,
            admin_region VARCHAR,
            edit_count   INTEGER,
            unique_users INTEGER,
            pct_creates  DOUBLE,
            pct_building DOUBLE,
            pct_highway  DOUBLE,
            dominant_tag VARCHAR,
            centroid_lat DOUBLE,
            centroid_lon DOUBLE
        )
    """)

    conn.execute("""
        CREATE TABLE IF NOT EXISTS baselines (
            country_code   VARCHAR,
            admin_region   VARCHAR,
            hour_of_day    INTEGER,
            baseline_mean  DOUBLE,
            baseline_std   DOUBLE,
            sample_count   INTEGER,
            computed_at    TIMESTAMP
        )
    """)

    conn.execute("""
        CREATE TABLE IF NOT EXISTS gold_surges (
            surge_id       VARCHAR,
            detected_at    TIMESTAMP,
            country_code   VARCHAR,
            admin_region   VARCHAR,
            window_start   TIMESTAMP,
            window_end     TIMESTAMP,
            edit_count     INTEGER,
            baseline_mean  DOUBLE,
            z_score        DOUBLE,
            surge_magnitude DOUBLE,
            dominant_tag   VARCHAR,
            pct_building   DOUBLE,
            pct_highway    DOUBLE,
            centroid_lat   DOUBLE,
            centroid_lon   DOUBLE,
            explanation    VARCHAR,
            news_headlines JSON,
            status         VARCHAR
        )
    """)

    conn.execute("""
        CREATE INDEX IF NOT EXISTS idx_baselines
        ON baselines (country_code, admin_region, hour_of_day)
    """)

    conn.commit()
    logger.info("DuckDB tables ready at %s", DB_PATH)


def get_baseline(
    conn: duckdb.DuckDBPyConnection,
    country_code: str,
    admin_region: str,
    hour_of_day: int,
) -> dict | None:
    row = conn.execute(
        """
        SELECT baseline_mean, baseline_std, sample_count
        FROM baselines
        WHERE country_code = ? AND admin_region = ? AND hour_of_day = ?
        LIMIT 1
        """,
        [country_code, admin_region, hour_of_day],
    ).fetchone()

    if row is None:
        return None

    return {
        "baseline_mean": row[0] or 0.0,
        "baseline_std": row[1] or 0.0,   # STDDEV returns NULL for single sample
        "sample_count": row[2],
    }


def get_global_95th_percentile(conn: duckdb.DuckDBPyConnection) -> float:
    row = conn.execute(
        "SELECT PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY edit_count) FROM silver_windowed_edits"
    ).fetchone()

    if row is None or row[0] is None:
        return 50.0  # cold-start sentinel

    return float(row[0])


def cleanup_old_records(conn: duckdb.DuckDBPyConnection) -> None:
    # Local retention is short by design: silver/gold are archived to Blob and bronze
    # is replayable from the OSM diff archive, so we keep only what the live pipeline
    # needs. Env-tunable; cast to int, so the INTERVAL literal is injection-safe.
    bronze_days = int(os.environ.get("BRONZE_RETENTION_DAYS", "3"))
    silver_days = int(os.environ.get("SILVER_RETENTION_DAYS", "8"))

    # Stored timestamps are naive IST; compare against naive IST "now".
    deleted_bronze = conn.execute(
        f"DELETE FROM bronze_raw_edits "
        f"WHERE processed_at < (NOW() AT TIME ZONE 'Asia/Kolkata') - INTERVAL '{bronze_days} days'"
    ).rowcount
    deleted_silver = conn.execute(
        f"DELETE FROM silver_windowed_edits "
        f"WHERE window_end < (NOW() AT TIME ZONE 'Asia/Kolkata') - INTERVAL '{silver_days} days'"
    ).rowcount
    conn.commit()
    logger.info(
        "Cleanup: removed %d bronze rows (>%dd), %d silver rows (>%dd)",
        deleted_bronze, bronze_days, deleted_silver, silver_days,
    )
