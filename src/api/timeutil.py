"""
Timezone convention for the API (mirrors processor/timeutil.py).

Stored timestamps are naive datetimes in IST (UTC+5:30) wall-clock. The API filters
them against now_ist() (also naive IST), and serialises them with the IST tzinfo so
clients receive correctly-labelled "+05:30" timestamps.
"""

from datetime import datetime, timedelta, timezone

# Fixed IST offset (India has no DST, so +5:30 is exact).
IST = timezone(timedelta(hours=5, minutes=30))


def now_ist() -> datetime:
    """Current time as a naive datetime in IST (UTC+5:30) wall-clock."""
    return datetime.now(IST).replace(tzinfo=None)
