import asyncio
import json
import logging
import os
import time
from datetime import datetime, timedelta

import aiohttp
import duckdb
import redis
import reverse_geocoder as rg
from openai import AsyncOpenAI

from redis_consumer import (
    GROUP_EXPLAINER,
    STREAM_SURGES,
    ack_message,
    read_messages,
)

# News comes from the GDELT Cloud Events API (gdeltcloud.com/api/v2/events). Each event
# is geolocated, so we query by the surge centroid (near + radius) over the surge's date
# window and read the source articles GDELT links to each event. Requires an API key in
# the GDELT_API_KEY env var; if unset, surges are still recorded, just without news.
GDELT_EVENTS_URL    = "https://gdeltcloud.com/api/v2/events"
GDELT_RADIUS_KM     = 50       # proximity around the surge centroid (surges are local)
GDELT_MAX_RECORDS   = 5
GDELT_LOOKBACK_DAYS = 2        # news window: the surge day and the ~2 days before it
GDELT_MIN_INTERVAL  = 1.0      # courtesy spacing (s) between GDELT Cloud requests
CONSUMER_NAME       = "explainer-1"

logger = logging.getLogger(__name__)

# Cap concurrent external calls: a window flush can emit several surges at once, and
# firing GDELT + OpenAI for all of them would exhaust connections and time out.
_API_SEMAPHORE = asyncio.Semaphore(3)

# GDELT Cloud enforces plan-based quotas (HTTP 429 `RATE_LIMITED`). A dedicated lock plus
# a monotonic timestamp serialise GDELT calls and space them at least GDELT_MIN_INTERVAL
# apart, independent of the OpenAI semaphore, to avoid bursting the quota.
_GDELT_LOCK = asyncio.Lock()
_gdelt_last_ts: float = 0.0   # time.monotonic() of the last GDELT request


async def _place_name_for_surge(surge: dict) -> str | None:
    """Reverse-geocode the surge centroid to a city/place name for the explanation
    prompt's location string. Silver records only carry country_code/admin_region (a
    province-level name); the centroid recovers a more specific city name, same as
    enricher's per-edit geocoding but for a single point."""
    try:
        lat = float(surge.get("centroid_lat") or "")
        lon = float(surge.get("centroid_lon") or "")
    except (TypeError, ValueError):
        return None
    if not (-90.0 <= lat <= 90.0 and -180.0 <= lon <= 180.0):
        return None

    try:
        result = await asyncio.to_thread(rg.search, [(lat, lon)], mode=1)
        return result[0].get("name") or None
    except Exception:
        logger.exception("Reverse geocode for city name failed (%s, %s)", lat, lon)
        return None


def _date_window(surge: dict) -> tuple[str, str]:
    """Calendar date window (YYYY-MM-DD) for the Events query: the surge day and the
    GDELT_LOOKBACK_DAYS before it. Only the calendar date of the surge's IST timestamp is
    used, so the timezone offset is irrelevant."""
    stamp = (surge.get("detected_at") or surge.get("window_start") or "")[:10]
    try:
        end = datetime.strptime(stamp, "%Y-%m-%d").date()
    except (TypeError, ValueError):
        end = datetime.now().date()
    start = end - timedelta(days=GDELT_LOOKBACK_DAYS)
    return start.isoformat(), end.isoformat()


async def _query_events(
    session: aiohttp.ClientSession,
    api_key: str,
    lat: float,
    lon: float,
    date_start: str,
    date_end: str,
) -> list[dict]:
    """Query the GDELT Cloud Events API for events near the surge centroid and return
    their source articles as {title, url, publishedAt} — the shape stored in
    news_headlines. Returns [] on any error (auth, quota/429, non-JSON, network)."""
    global _gdelt_last_ts

    params = {
        "near":       f"{lat},{lon}",
        "radius_km":  str(GDELT_RADIUS_KM),
        "date_start": date_start,
        "date_end":   date_end,
        "sort":       "recent",
        "limit":      str(GDELT_MAX_RECORDS),
    }
    headers = {"Authorization": f"Bearer {api_key}"}

    # Serialise + space requests under the pacer lock (held across the request so two
    # surges can never overlap a GDELT call).
    async with _GDELT_LOCK:
        wait = GDELT_MIN_INTERVAL - (time.monotonic() - _gdelt_last_ts)
        if wait > 0:
            await asyncio.sleep(wait)
        try:
            async with session.get(
                GDELT_EVENTS_URL,
                params=params,
                headers=headers,
                timeout=aiohttp.ClientTimeout(total=30),
            ) as resp:
                status = resp.status
                body = await resp.text()
        except Exception:
            logger.exception("GDELT Events request failed near %s,%s", lat, lon)
            return []
        finally:
            _gdelt_last_ts = time.monotonic()

    if status != 200:
        logger.warning("GDELT Events returned HTTP %d near %s,%s: %.80s", status, lat, lon, body)
        return []

    try:
        data = json.loads(body)
    except (ValueError, TypeError):
        logger.warning("GDELT Events returned non-JSON near %s,%s: %.80s", lat, lon, body)
        return []

    out: list[dict] = []
    seen: set[str] = set()
    for event in (data.get("data") or []):
        for article in (event.get("top_articles") or []):
            url = article.get("url")
            title = article.get("title")
            if title and url and url not in seen:
                seen.add(url)
                out.append({"title": title, "url": url, "publishedAt": article.get("article_date")})
                if len(out) >= GDELT_MAX_RECORDS:
                    return out
    return out


async def _fetch_news(session: aiohttp.ClientSession, surge: dict) -> list[dict]:
    """Find recent news for a surge via the GDELT Cloud Events API, keyed on the surge
    centroid (near/radius) and its date window. Needs GDELT_API_KEY; returns [] if the
    key is unset or the centroid is missing/invalid."""
    api_key = os.environ.get("GDELT_API_KEY", "")
    if not api_key:
        return []
    try:
        lat = float(surge.get("centroid_lat") or "")
        lon = float(surge.get("centroid_lon") or "")
    except (TypeError, ValueError):
        return []
    if not (-90.0 <= lat <= 90.0 and -180.0 <= lon <= 180.0):
        return []
    date_start, date_end = _date_window(surge)
    return await _query_events(session, api_key, lat, lon, date_start, date_end)


async def _generate_explanation(
    openai_client: AsyncOpenAI,
    surge: dict,
    headlines: list[dict],
    city_name: str | None,
) -> str:
    pct_building = float(surge.get("pct_building", 0)) * 100
    pct_highway  = float(surge.get("pct_highway", 0)) * 100
    magnitude    = float(surge.get("surge_magnitude", 0))
    try:
        unique_users = int(surge.get("unique_users", 0))
    except (TypeError, ValueError):
        unique_users = 0

    location = ", ".join(
        part for part in (city_name, surge.get("admin_region"), surge.get("country_name")) if part
    ) or "unknown"

    if headlines:
        headlines_text = "\n".join(f"- {h['title']}" for h in headlines)
        news_section = f"Recent news headlines for this region:\n{headlines_text}"
        news_instruction = (
            "Ground your answer in these headlines only if they plausibly relate to this "
            "location and time window. Ignore any that look unrelated."
        )
    else:
        news_section = "No recent news headlines were found for this region."
        news_instruction = (
            "Since no news was found, do NOT invent a news-based scenario (no disaster, "
            "election, or event you have no evidence for). Instead give the single most "
            "likely explanation based only on the mapping stats below, and note that it's "
            "inferred from edit activity alone, not confirmed by news."
        )

    prompt = (
        f"A mapping surge was detected on OpenStreetMap.\n\n"
        f"Location: {location}\n"
        f"Time: {surge.get('detected_at')} IST\n"
        f"Edit volume: {magnitude:.1f}x above normal\n"
        f"Dominant edit type: {surge.get('dominant_tag')} "
        f"({pct_building:.0f}% buildings, {pct_highway:.0f}% roads)\n"
        f"Unique mappers: {unique_users}\n\n"
        f"{news_section}\n\n"
        f"Heuristic: 2-3 unique mappers combined with a high building/road percentage "
        f"usually indicates a bulk import or few dedicated mapper working alone, not an "
        f"external event. Many unique mappers editing the same area at once usually "
        f"indicates a coordinated mapathon, disaster-response effort, or a real-world "
        f"event drawing local attention — use this to make a specific, confident call "
        f"rather than a vague guess.\n\n"
        f"{news_instruction}\n\n"
        f"In one concise sentence, state the most likely explanation for this mapping surge."
    )

    try:
        response = await openai_client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=100,
        )
        return response.choices[0].message.content.strip()
    except Exception:
        logger.exception("OpenAI explanation failed for surge %s", surge.get("surge_id"))
        return ""


async def _enrich_surge(
    redis_client: redis.Redis,
    conn: duckdb.DuckDBPyConnection,
    session: aiohttp.ClientSession,
    openai_client: AsyncOpenAI,
    msg_id: str,
    surge: dict,
) -> None:
    surge_id = surge.get("surge_id", "")

    city_name = await _place_name_for_surge(surge)

    # The two external calls run under the semaphore; the local DB write doesn't.
    async with _API_SEMAPHORE:
        headlines = await _fetch_news(session, surge)
        explanation = await _generate_explanation(openai_client, surge, headlines, city_name)

    if surge_id:
        try:
            conn.execute(
                """
                UPDATE gold_surges
                SET explanation = ?, news_headlines = ?
                WHERE surge_id = ?
                """,
                [explanation, json.dumps(headlines), surge_id],
            )
            conn.commit()
        except Exception:
            logger.exception("DuckDB update failed for surge %s", surge_id)

    # ACK only after the write completes.
    ack_message(redis_client, STREAM_SURGES, GROUP_EXPLAINER, msg_id)

    logger.info(
        "Explained surge %s (%s/%s): %d headlines, explanation length %d",
        surge_id,
        surge.get("country_code"),
        surge.get("admin_region"),
        len(headlines),
        len(explanation),
    )


async def explain_surges_loop(
    redis_client: redis.Redis,
    conn: duckdb.DuckDBPyConnection,
) -> None:
    # Explicit timeout + capped retries so requests can't hang and pile up under load.
    openai_client = AsyncOpenAI(
        api_key=os.environ.get("OPENAI_API_KEY", ""),
        timeout=30.0,
        max_retries=2,
    )

    async with aiohttp.ClientSession() as session:
        while True:
            try:
                messages = read_messages(
                    redis_client,
                    STREAM_SURGES,
                    GROUP_EXPLAINER,
                    CONSUMER_NAME,
                    count=10,
                    block_ms=1000,
                )

                if not messages:
                    await asyncio.sleep(0)
                    continue

                tasks = [
                    _enrich_surge(redis_client, conn, session, openai_client, msg_id, fields)
                    for msg_id, fields in messages
                ]
                await asyncio.gather(*tasks, return_exceptions=True)

            except Exception:
                logger.exception("Explainer loop error")
                await asyncio.sleep(5)
