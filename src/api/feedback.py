"""
Append user feedback to the JSONL blob <container>/updates/feedback.jsonl.

Storage is append-only: one JSON object per line, written with a single atomic
append-block (via blob_storage.append_line) — no read-modify-write, so each write is
O(1) regardless of how much feedback exists. A cheap asyncio.Lock still guards the
"create blob on first append" race on the single event loop.

Abuse control (the endpoint is public through the dashboard proxy):
  - per-IP rate limit lives on the route (slowapi).
  - a process-wide ceiling here (GLOBAL_MAX_PER_MIN) bounds total writes/min no matter
    how many IPs attack — past it we drop the write (still 204). Safe because storage
    is best-effort. Assumes the single uvicorn worker the deployment runs.

Each line: {"name", "email", "type", "feedback", "submitted_at"} — name/email are ""
when not given; submitted_at is a naive-IST ISO timestamp (matching the rest of the system).
"""

import asyncio
import json
import logging
import time
from collections import deque

from api.blob_storage import append_line, is_configured
from api.timeutil import now_ist

logger = logging.getLogger(__name__)

_BLOB = "updates/feedback.jsonl"

# Per-field caps so one submission can't be huge (belt-and-suspenders with the route model).
MAX_NAME_LEN = 100
MAX_EMAIL_LEN = 254
MAX_TYPE_LEN = 60
MAX_TEXT_LEN = 4000

# Process-wide write ceiling: at most this many accepted writes per rolling 60s,
# independent of client IP (blunts a distributed flood / Azure-cost DoS).
GLOBAL_MAX_PER_MIN = 20
_WINDOW_SEC = 60.0
_recent_writes: deque[float] = deque()

_lock = asyncio.Lock()


def _global_allow() -> bool:
    """Sliding-window global throttle. Synchronous (no await) so it runs atomically."""
    now = time.monotonic()
    while _recent_writes and now - _recent_writes[0] >= _WINDOW_SEC:
        _recent_writes.popleft()
    if len(_recent_writes) >= GLOBAL_MAX_PER_MIN:
        return False
    _recent_writes.append(now)
    return True


async def record_feedback(name: str, email: str, feedback_type: str, text: str) -> bool:
    """Append one feedback entry as a JSON line. False if unconfigured/throttled/failed."""
    if not is_configured():
        return False
    if not _global_allow():
        logger.warning("Feedback dropped: global write ceiling (%d/min) reached", GLOBAL_MAX_PER_MIN)
        return False

    entry = {
        "name": (name or "").strip()[:MAX_NAME_LEN],
        "email": (email or "").strip()[:MAX_EMAIL_LEN],
        "type": (feedback_type or "").strip()[:MAX_TYPE_LEN],
        "feedback": (text or "").strip()[:MAX_TEXT_LEN],
        "submitted_at": now_ist().isoformat(),
    }
    line = json.dumps(entry, ensure_ascii=False)

    try:
        # append_line creates the blob on first use; the lock serialises that create
        # race. The append itself is O(1), so holding the lock is now cheap.
        async with _lock:
            await asyncio.to_thread(append_line, _BLOB, line)
        return True
    except Exception:
        logger.exception("Feedback append failed")
        return False
