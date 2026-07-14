"""
In-memory cache of the "What's new" / "What's coming" update lists, refreshed
from Azure Blob every REFRESH_SECONDS and served inline on GET /stats — so the
dashboard picks them up with the stats it already polls, needing no extra endpoint.

Source blobs (one non-blank line = one bullet):
    <container>/updates/whats_new.txt
    <container>/updates/whats_coming.txt

Best-effort: if Azure is unconfigured the lists stay empty; if a single refresh
fails the last-good value is kept (never blanked). Everything runs on the API's
single event loop, so the module-level lists need no lock.
"""

import asyncio
import logging

from api.blob_storage import is_configured, read_text

logger = logging.getLogger(__name__)

REFRESH_SECONDS = 60
MAX_ENTRIES = 50      # cap a runaway file so /stats can't balloon
MAX_LINE_LEN = 300    # trim over-long lines

_WHATS_NEW_BLOB = "updates/whats_new.txt"
_WHATS_COMING_BLOB = "updates/whats_coming.txt"

# Current parsed lists; each string is one bullet. Read by routes/stats.py.
whats_new: list[str] = []
whats_coming: list[str] = []


def _parse(text: str | None) -> list[str]:
    """One non-blank line -> one bullet, trimmed, length- and count-capped."""
    if not text:
        return []
    lines = (ln.strip() for ln in text.splitlines())
    return [ln[:MAX_LINE_LEN] for ln in lines if ln][:MAX_ENTRIES]


async def _refresh_once() -> None:
    global whats_new, whats_coming
    new_txt, coming_txt = await asyncio.gather(
        asyncio.to_thread(read_text, _WHATS_NEW_BLOB),
        asyncio.to_thread(read_text, _WHATS_COMING_BLOB),
    )
    # read_text returns None on a missing/failed read; only replace on a real read
    # so a transient blob hiccup keeps the last-good list instead of clearing it.
    if new_txt is not None:
        whats_new = _parse(new_txt)
    if coming_txt is not None:
        whats_coming = _parse(coming_txt)


async def refresh_loop() -> None:
    """Refresh both update lists from Blob every REFRESH_SECONDS (immediately first)."""
    if not is_configured():
        logger.info(
            "Azure Blob not configured — What's-new/coming lists disabled "
            "(/stats still returns, just with empty lists)."
        )
        return

    logger.info("What's-new/coming lists will refresh from Blob every %ds", REFRESH_SECONDS)
    while True:
        try:
            await _refresh_once()
        except Exception:
            logger.exception("Refreshing update lists from Blob failed")
        await asyncio.sleep(REFRESH_SECONDS)
