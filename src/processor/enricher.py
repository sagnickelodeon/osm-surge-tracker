import asyncio
import json
import logging
from datetime import datetime
from typing import Any

import duckdb
import redis
import reverse_geocoder as rg

from timeutil import now_ist

logger = logging.getLogger(__name__)

# ISO-3166 alpha-2 → country name for the ~50 most-edited OSM countries; unknown
# codes fall back to the code itself.
COUNTRY_NAMES: dict[str, str] = {
    "US": "United States",
    "DE": "Germany",
    "FR": "France",
    "GB": "United Kingdom",
    "RU": "Russia",
    "JP": "Japan",
    "CN": "China",
    "IN": "India",
    "BR": "Brazil",
    "CA": "Canada",
    "AU": "Australia",
    "IT": "Italy",
    "ES": "Spain",
    "NL": "Netherlands",
    "PL": "Poland",
    "UA": "Ukraine",
    "SE": "Sweden",
    "NO": "Norway",
    "FI": "Finland",
    "DK": "Denmark",
    "CH": "Switzerland",
    "AT": "Austria",
    "BE": "Belgium",
    "CZ": "Czechia",
    "HU": "Hungary",
    "RO": "Romania",
    "TR": "Turkey",
    "ID": "Indonesia",
    "NG": "Nigeria",
    "TZ": "Tanzania",
    "KE": "Kenya",
    "ET": "Ethiopia",
    "CD": "DR Congo",
    "ZA": "South Africa",
    "MX": "Mexico",
    "AR": "Argentina",
    "CO": "Colombia",
    "PH": "Philippines",
    "VN": "Vietnam",
    "TH": "Thailand",
    "PK": "Pakistan",
    "BD": "Bangladesh",
    "EG": "Egypt",
    "IR": "Iran",
    "IQ": "Iraq",
    "SA": "Saudi Arabia",
    "KR": "South Korea",
    "MY": "Malaysia",
    "NZ": "New Zealand",
    "PT": "Portugal",
}


def deserialize_raw_fields(fields: dict[str, str]) -> dict[str, Any]:
    return {
        "event_id":        fields["event_id"],
        "sequence_number": int(fields["sequence_number"]),
        # fromisoformat (3.10) rejects the trailing "Z", so swap it for "+00:00".
        "timestamp":       datetime.fromisoformat(
                               fields["timestamp"].replace("Z", "+00:00")
                           ),
        "edit_type":       fields["edit_type"],
        "osm_type":        fields["osm_type"],
        "osm_id":          int(fields["osm_id"]),
        # lat/lon arrive JSON-serialized: "null" or a float string.
        "lat":             json.loads(fields["lat"]),
        "lon":             json.loads(fields["lon"]),
        "changeset_id":    int(fields["changeset_id"]),
        "user":            fields["user"],
        "tags":            json.loads(fields["tags"]),
    }


async def _reverse_geocode_batch(
    events: list[dict[str, Any]],
) -> list[dict[str, str | None]]:
    """
    Geocode a batch in one rg.search call, returning geo dicts aligned with the
    input list (None-filled for events without coordinates).

    rg.search is synchronous and CPU-bound, so we offload it to a worker thread —
    running it on the event loop would stall every other coroutine.
    """
    coord_indices: list[int] = []
    coord_pairs:   list[tuple[float, float]] = []

    for i, event in enumerate(events):
        lat, lon = event.get("lat"), event.get("lon")
        if (
            lat is not None
            and lon is not None
            and -90.0 <= lat <= 90.0
            and -180.0 <= lon <= 180.0
        ):
            coord_indices.append(i)
            coord_pairs.append((lat, lon))

    # Result slots, None by default.
    geo_results: list[dict[str, str | None]] = [
        {"country_code": None, "country_name": None, "admin_region": None, "place_name": None}
        for _ in events
    ]

    if not coord_pairs:
        return geo_results

    try:
        rg_results = await asyncio.to_thread(rg.search, coord_pairs, mode=1)
    except Exception:
        logger.exception("reverse_geocoder batch lookup failed")
        return geo_results

    for list_pos, event_idx in enumerate(coord_indices):
        r = rg_results[list_pos]
        cc = r.get("cc") or ""
        geo_results[event_idx] = {
            "country_code": cc or None,
            "country_name": COUNTRY_NAMES.get(cc, cc) if cc else None,
            "admin_region": r.get("admin1") or None,
            "place_name":   r.get("name") or None,
        }

    return geo_results


async def enrich_batch(events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    now = now_ist()
    geo = await _reverse_geocode_batch(events)

    enriched: list[dict[str, Any]] = []
    for event, geo_info in zip(events, geo):
        has_coords = event.get("lat") is not None and event.get("lon") is not None
        enriched.append({
            **event,
            "country_code": geo_info["country_code"],
            "country_name": geo_info["country_name"],
            "admin_region": geo_info["admin_region"],
            "place_name":   geo_info["place_name"],
            "has_coords":   has_coords,
            "processed_at": now,
        })

    return enriched


def insert_bronze_batch(
    conn: duckdb.DuckDBPyConnection,
    enriched: list[dict[str, Any]],
) -> None:
    if not enriched:
        return

    rows = [
        (
            e["event_id"],
            e["sequence_number"],
            e["timestamp"],
            e["edit_type"],
            e["osm_type"],
            e["osm_id"],
            e["lat"],
            e["lon"],
            e["changeset_id"],
            e["user"],
            json.dumps(e["tags"]),
            e["country_code"],
            e["country_name"],
            e["admin_region"],
            e["place_name"],
            e["has_coords"],
            e["processed_at"],
        )
        for e in enriched
    ]

    conn.executemany(
        """
        INSERT INTO bronze_raw_edits VALUES (
            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        )
        """,
        rows,
    )
    conn.commit()


def _serialize_for_redis(value: Any) -> str:
    if value is None:
        return "null"
    if isinstance(value, (dict, list)):
        return json.dumps(value)
    if isinstance(value, datetime):
        return value.strftime("%Y-%m-%dT%H:%M:%SZ")
    if isinstance(value, bool):
        return "true" if value else "false"
    return str(value)


def push_enriched_to_redis(
    redis_client: redis.Redis,
    enriched: list[dict[str, Any]],
) -> None:
    if not enriched:
        return

    pipe = redis_client.pipeline(transaction=False)
    for e in enriched:
        fields = {k: _serialize_for_redis(v) for k, v in e.items()}
        pipe.xadd("osm:enriched", fields, maxlen=100_000, approximate=True)
    pipe.execute()
