"""
Pydantic response models for the API.

They document each endpoint's JSON shape and normalise DuckDB/Parquet quirks
(naive timestamps, JSON-encoded columns) via validators.
"""

import json
from datetime import datetime

from pydantic import BaseModel, field_validator

from api.timeutil import IST


class NewsItem(BaseModel):
    """One news article attached to a surge by the explainer (Component 2)."""

    title: str
    url: str | None = None
    publishedAt: str | None = None


class SurgeResponse(BaseModel):
    """A single confirmed surge, mirroring the gold_surges table."""

    surge_id: str
    detected_at: datetime
    country_code: str | None = None
    admin_region: str | None = None
    window_start: datetime
    window_end: datetime
    edit_count: int
    baseline_mean: float
    z_score: float          # -1.0 is a sentinel for cold-start detections
    surge_magnitude: float
    dominant_tag: str | None = None
    pct_building: float
    pct_highway: float
    centroid_lat: float | None = None
    centroid_lon: float | None = None
    explanation: str = ""
    news_headlines: list[NewsItem] = []
    status: str

    @field_validator("detected_at", "window_start", "window_end", mode="before")
    @classmethod
    def _attach_ist(cls, v: object) -> object:
        """
        DuckDB returns naive datetimes; the processor stored them as IST wall-clock
        (processor/timeutil.py). Attach the IST offset so Pydantic serialises "+05:30".
        """
        if isinstance(v, datetime) and v.tzinfo is None:
            return v.replace(tzinfo=IST)
        return v

    @field_validator("news_headlines", mode="before")
    @classmethod
    def _parse_headlines(cls, v: object) -> object:
        """
        news_headlines is stored as a JSON string (explainer writes json.dumps([...]),
        detector seeds "[]"). Parse to a list, tolerating None, "null", and bad JSON.
        """
        if v is None or v == "null":
            return []
        if isinstance(v, str):
            try:
                parsed = json.loads(v)
                return parsed if isinstance(parsed, list) else []
            except (json.JSONDecodeError, TypeError):
                return []
        return v


class HeatmapPoint(BaseModel):
    """One region's aggregated edit density for the background map layer."""

    country_code: str | None = None
    admin_region: str | None = None
    total_edits: int
    centroid_lat: float
    centroid_lon: float


class StatsResponse(BaseModel):
    """Dashboard-header summary numbers. Fields default to zero/None so a cold
    start still returns a valid payload."""

    total_surges_today: int = 0
    countries_affected: int = 0
    highest_magnitude_today: float | None = None   # MAX() is NULL when no surges
    edits_last_hour: int = 0
    # The heatmap's look-back window (hours), so the dashboard can describe it without
    # hard-coding a value that would drift from the backend. Source: routes/heatmap.py.
    heatmap_window_hours: int = 1
    # Update lists shown by the dashboard's What's-new / What's-coming buttons.
    # Refreshed from Azure Blob by api/updates.py; empty when unconfigured.
    whats_new: list[str] = []
    whats_coming: list[str] = []


class HealthResponse(BaseModel):
    """Liveness probe payload."""

    status: str
    timestamp: str
