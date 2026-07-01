import json
import logging
from collections import Counter, defaultdict
from datetime import datetime, timedelta
from statistics import mean
from typing import Any

import duckdb

from timeutil import now_ist

logger = logging.getLogger(__name__)

WINDOW_MINUTES = 5

# Type alias for the per-region bucket key
BucketKey = tuple[str | None, str | None]


def _new_bucket() -> dict[str, Any]:
    return {
        "edit_count":     0,
        "unique_users":   set(),
        "edit_types":     Counter(),
        "osm_types":      Counter(),
        "tag_keys":       Counter(),
        "building_count": 0,
        "highway_count":  0,
        "sample_lats":    [],
        "sample_lons":    [],
    }


class WindowBuffer:
    def __init__(self) -> None:
        self._buckets: defaultdict[BucketKey, dict[str, Any]] = defaultdict(_new_bucket)

    def add_event(self, event: dict[str, Any]) -> None:
        key: BucketKey = (event.get("country_code"), event.get("admin_region"))
        b = self._buckets[key]

        b["edit_count"] += 1
        b["unique_users"].add(event.get("user", ""))
        b["edit_types"][event.get("edit_type", "")] += 1
        b["osm_types"][event.get("osm_type", "")] += 1

        tags: dict = event.get("tags") or {}
        for tag_key in tags:
            b["tag_keys"][tag_key] += 1
        if "building" in tags:
            b["building_count"] += 1
        if "highway" in tags:
            b["highway_count"] += 1

        lat, lon = event.get("lat"), event.get("lon")
        if lat is not None and lon is not None:
            if len(b["sample_lats"]) < 10:
                b["sample_lats"].append(lat)
                b["sample_lons"].append(lon)

    def flush(
        self,
        conn: duckdb.DuckDBPyConnection,
        window_start: datetime,
        window_end: datetime,
    ) -> list[dict[str, Any]]:
        if not self._buckets:
            return []

        records: list[dict[str, Any]] = []
        rows: list[tuple] = []

        for (country_code, admin_region), b in self._buckets.items():
            ec = b["edit_count"]
            if ec == 0:
                continue

            pct_creates  = b["edit_types"]["create"]  / ec
            pct_building = b["building_count"] / ec
            pct_highway  = b["highway_count"]  / ec

            tag_keys: Counter = b["tag_keys"]
            dominant_tag = tag_keys.most_common(1)[0][0] if tag_keys else None

            centroid_lat = mean(b["sample_lats"]) if b["sample_lats"] else None
            centroid_lon = mean(b["sample_lons"]) if b["sample_lons"] else None

            record = {
                "window_start": window_start,
                "window_end":   window_end,
                "country_code": country_code,
                "admin_region": admin_region,
                "edit_count":   ec,
                "unique_users": len(b["unique_users"]),
                "pct_creates":  pct_creates,
                "pct_building": pct_building,
                "pct_highway":  pct_highway,
                "dominant_tag": dominant_tag,
                "centroid_lat": centroid_lat,
                "centroid_lon": centroid_lon,
            }
            records.append(record)
            rows.append((
                window_start,
                window_end,
                country_code,
                admin_region,
                ec,
                len(b["unique_users"]),
                pct_creates,
                pct_building,
                pct_highway,
                dominant_tag,
                centroid_lat,
                centroid_lon,
            ))

        if rows:
            conn.executemany(
                "INSERT INTO silver_windowed_edits VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
                rows,
            )
            conn.commit()

        bucket_count = len(self._buckets)
        self._buckets = defaultdict(_new_bucket)

        logger.info(
            "Flushed window %s–%s: %d region buckets, %d silver records",
            window_start.isoformat(), window_end.isoformat(), bucket_count, len(records),
        )
        return records


def get_current_window() -> tuple[datetime, datetime]:
    now = now_ist()
    floored_minute = (now.minute // WINDOW_MINUTES) * WINDOW_MINUTES
    start = now.replace(minute=floored_minute, second=0, microsecond=0)
    end = start + timedelta(minutes=WINDOW_MINUTES)
    return start, end
