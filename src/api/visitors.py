"""
In-memory visitor buffer + hourly flush to the Azure Blob visitor log.

Each /track beacon is recorded in a dict keyed by a salted HMAC of the client IP;
the raw IP never touches disk or the blob. Once an hour, flush_loop() appends one
JSON summary line for the hour just ended and clears the buffer:

    {"hour": "...+05:30", "unique_visitors": N, "total_pageviews": M, "dropped_new_ips": D,
     "visitors": [{"ip_hash": "...", "user_agent": "...", "hits": K, "first_seen": "..."}]}

unique_visitors (distinct hashes) is the people count. Privacy:
  - _SALT is fresh os.urandom(32) per process, never persisted — so a random secret
    key makes the hashes irreversible and uncorrelatable across restarts. The blob
    holds only opaque per-lifetime tokens (no personal data under GDPR).
  - The buffer is bounded to MAX_TRACKED_IPS hashes/hour with truncated user-agents,
    so a flood of distinct IPs can't OOM the process; excess counts in dropped_new_ips.

Everything runs on the single event loop, so the plain dict needs no lock.
"""

import asyncio
import hashlib
import hmac
import json
import logging
import os
from datetime import timedelta

from api.blob_storage import append_line, is_configured
from api.timeutil import now_ist

logger = logging.getLogger(__name__)

# Memory-DoS guard: max distinct hashes per hour, and max stored UA length.
MAX_TRACKED_IPS = 3000
MAX_UA_LEN = 256

# One-time random salt, never persisted — hashes can't be correlated across restarts.
_SALT: bytes = os.urandom(32)

# ip_hash -> {"user_agent": str, "hits": int, "first_seen": iso str}
_buffer: dict[str, dict] = {}
_pageviews = 0
_dropped_new_ips = 0  # new-IP visits refused this hour because the cap was hit


def _hash_ip(ip: str) -> str:
    """16-char hex HMAC-SHA256 of the IP, keyed on the startup salt.

    64 bits is plenty to distinguish ~3000 visitors with negligible collisions.
    """
    return hmac.new(_SALT, ip.encode(), hashlib.sha256).hexdigest()[:16]


def record_visit(ip: str, user_agent: str) -> None:
    """Hash the IP and record one page-view beacon into the current hour's buffer."""
    global _pageviews, _dropped_new_ips
    _pageviews += 1
    user_agent = (user_agent or "")[:MAX_UA_LEN]
    ip_hash = _hash_ip(ip)
    existing = _buffer.get(ip_hash)
    if existing is None:
        # New visitor: admit only under the cap. Past it we still count the pageview
        # but don't allocate an entry (bounded memory).
        if len(_buffer) >= MAX_TRACKED_IPS:
            _dropped_new_ips += 1
            return
        _buffer[ip_hash] = {
            "user_agent": user_agent,
            "hits": 1,
            "first_seen": now_ist().isoformat(),
        }
    else:
        existing["hits"] += 1
        # Backfill the user-agent if the first beacon had none.
        if user_agent and not existing["user_agent"]:
            existing["user_agent"] = user_agent


def _build_and_reset(hour_label: str) -> dict:
    """Snapshot the buffer into a summary dict for *hour_label*, then clear it."""
    global _pageviews, _dropped_new_ips
    summary = {
        "hour": hour_label,
        "unique_visitors": len(_buffer),
        "total_pageviews": _pageviews,
        "dropped_new_ips": _dropped_new_ips,
        "visitors": [{"ip_hash": h, **rec} for h, rec in _buffer.items()],
    }
    _buffer.clear()
    _pageviews = 0
    _dropped_new_ips = 0
    return summary


async def flush_loop() -> None:
    """
    On the hour, append the just-ended hour's summary to the blob, then reset.

    Returns immediately if Azure isn't configured. A zero-visitor hour still writes a
    line, so the log explicitly records "0 people this hour".
    """
    if not is_configured():
        logger.info(
            "Azure Blob not configured — hourly visitor logging disabled "
            "(/track still accepts beacons; they are simply not persisted)."
        )
        return

    logger.info("Hourly visitor logging to Azure Blob enabled")

    while True:
        # Sleep until the next top-of-hour boundary.
        now = now_ist()
        next_hour = now.replace(minute=0, second=0, microsecond=0) + timedelta(hours=1)
        await asyncio.sleep(max(1.0, (next_hour - now).total_seconds()))

        # The hour that just ended is [next_hour - 1h, next_hour).
        hour_start = next_hour - timedelta(hours=1)
        summary = _build_and_reset(hour_start.isoformat())

        blob_name = f"logs/visits-{hour_start.strftime('%Y-%m-%d')}.log"
        try:
            await asyncio.to_thread(append_line, blob_name, json.dumps(summary))
        except Exception:
            logger.exception("Visitor log append for hour %s failed", hour_start)
