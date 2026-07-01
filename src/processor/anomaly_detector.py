import asyncio
import json
import logging
import uuid
from typing import Any

import duckdb
import redis

from db import get_baseline, get_global_95th_percentile
from enricher import COUNTRY_NAMES
from timeutil import now_ist

ZSCORE_THRESHOLD    = 3.0
MAGNITUDE_THRESHOLD = 5.0
MIN_EDIT_COUNT      = 20
BASELINE_MIN_SAMPLES = 10

STREAM_SURGES     = "osm:surges"
SURGES_MAXLEN     = 10_000

logger = logging.getLogger(__name__)


def _detect_surge(
    conn: duckdb.DuckDBPyConnection,
    redis_client: redis.Redis,
    silver: dict[str, Any],
) -> bool:
    country_code = silver.get("country_code")
    admin_region = silver.get("admin_region")
    edit_count   = silver["edit_count"]

    # Skip null-coord bucket (no geographic identity)
    if not country_code or not admin_region:
        return False

    window_start: datetime = silver["window_start"]
    hour_of_day = window_start.hour

    baseline = get_baseline(conn, country_code, admin_region, hour_of_day)

    if baseline and baseline["sample_count"] >= BASELINE_MIN_SAMPLES:
        std = max(baseline["baseline_std"], 1.0)
        baseline_mean = baseline["baseline_mean"]
        z_score = (edit_count - baseline_mean) / std
        surge_magnitude = edit_count / max(baseline_mean, 1.0)
        is_surge = (
            z_score > ZSCORE_THRESHOLD
            and surge_magnitude > MAGNITUDE_THRESHOLD
            and edit_count > MIN_EDIT_COUNT
        )
    else:
        # Cold-start fallback: flag if edit count is more than 2x the global 95th percentile
        p95 = get_global_95th_percentile(conn)
        baseline_mean = p95
        z_score = -1.0  # sentinel — not a real z-score
        surge_magnitude = edit_count / max(p95, 1.0)
        is_surge = edit_count > p95 * 2 and edit_count > MIN_EDIT_COUNT

    if not is_surge:
        return False

    surge_id = str(uuid.uuid4())
    detected_at = now_ist()   # naive IST wall-clock (see timeutil)

    conn.execute(
        """
        INSERT INTO gold_surges VALUES (
            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        )
        """,
        [
            surge_id,
            detected_at,
            country_code,
            admin_region,
            silver["window_start"],
            silver["window_end"],
            edit_count,
            baseline_mean,
            z_score,
            surge_magnitude,
            silver.get("dominant_tag"),
            silver.get("pct_building", 0.0),
            silver.get("pct_highway", 0.0),
            silver.get("centroid_lat"),
            silver.get("centroid_lon"),
            "",       # explanation — filled by explainer
            "[]",     # news_headlines — filled by explainer
            "active",
        ],
    )
    conn.commit()

    country_name = COUNTRY_NAMES.get(country_code, country_code)

    redis_client.xadd(
        STREAM_SURGES,
        {
            "surge_id":       surge_id,
            # Naive IST values — label with the +05:30 offset, not a 'Z' (UTC).
            "detected_at":    detected_at.strftime("%Y-%m-%dT%H:%M:%S+05:30"),
            "country_code":   country_code,
            "country_name":   country_name,
            "admin_region":   admin_region,
            "window_start":   silver["window_start"].strftime("%Y-%m-%dT%H:%M:%S+05:30"),
            "window_end":     silver["window_end"].strftime("%Y-%m-%dT%H:%M:%S+05:30"),
            "edit_count":     str(edit_count),
            "baseline_mean":  str(round(baseline_mean, 4)),
            "z_score":        str(round(z_score, 4)),
            "surge_magnitude": str(round(surge_magnitude, 4)),
            "dominant_tag":   silver.get("dominant_tag") or "",
            "pct_building":   str(round(silver.get("pct_building", 0.0), 4)),
            "pct_highway":    str(round(silver.get("pct_highway", 0.0), 4)),
            "unique_users":   str(silver.get("unique_users", 0)),
            "centroid_lat":   str(silver.get("centroid_lat") or ""),
            "centroid_lon":   str(silver.get("centroid_lon") or ""),
        },
        maxlen=SURGES_MAXLEN,
        approximate=True,
    )

    logger.warning(
        "SURGE detected: %s / %s — %d edits, z=%.1f, magnitude=%.1fx [id=%s]",
        country_code, admin_region, edit_count, z_score, surge_magnitude, surge_id,
    )
    return True


async def detect_anomalies_loop(
    conn: duckdb.DuckDBPyConnection,
    redis_client: redis.Redis,
    anomaly_queue: asyncio.Queue,
) -> None:
    while True:
        try:
            silver_records: list[dict[str, Any]] = await anomaly_queue.get()
            surge_count = 0
            for record in silver_records:
                try:
                    if _detect_surge(conn, redis_client, record):
                        surge_count += 1
                except Exception:
                    logger.exception(
                        "Surge detection failed for %s/%s",
                        record.get("country_code"), record.get("admin_region"),
                    )
            if surge_count:
                logger.info("Anomaly detector: %d surge(s) detected this window", surge_count)
            anomaly_queue.task_done()
        except Exception:
            logger.exception("Anomaly detector loop error")
            await asyncio.sleep(5)
