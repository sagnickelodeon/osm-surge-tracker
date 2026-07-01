"""
Timezone convention for the whole system.

Every timestamp written to DuckDB is a *naive* datetime holding IST (UTC+5:30)
wall-clock. Computing IST explicitly (rather than relying on host-timezone
conversion) keeps stored values identical regardless of the host TZ, e.g. a UTC VM.

SQL filtering these columns must use the matching naive-IST "now":
    NOW() AT TIME ZONE 'Asia/Kolkata'
"""

from datetime import datetime, timedelta, timezone

# Fixed IST offset. India does not observe DST, so a fixed +5:30 is exact.
IST = timezone(timedelta(hours=5, minutes=30))


def now_ist() -> datetime:
    """Current time as a naive datetime in IST (UTC+5:30) wall-clock."""
    return datetime.now(IST).replace(tzinfo=None)
