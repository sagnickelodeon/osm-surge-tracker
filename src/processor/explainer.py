import asyncio
import json
import logging
import os
from datetime import datetime, timedelta, timezone

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

NEWSAPI_URL     = "https://newsapi.org/v2/everything"
CONSUMER_NAME   = "explainer-1"
NEWSAPI_MAX_DAY = 80  # leave buffer below the 100 req/day free tier limit

logger = logging.getLogger(__name__)

# Cap concurrent external calls: a window flush can emit many surges at once, and
# firing NewsAPI + OpenAI for all of them would exhaust connections and time out.
_API_SEMAPHORE = asyncio.Semaphore(3)

# Daily NewsAPI request counter — reset at midnight UTC
_newsapi_date: str = ""
_newsapi_count: int = 0


def _newsapi_allowed() -> bool:
    global _newsapi_date, _newsapi_count
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    if today != _newsapi_date:
        _newsapi_date = today
        _newsapi_count = 0
    return _newsapi_count < NEWSAPI_MAX_DAY


def _newsapi_tick() -> None:
    global _newsapi_count
    _newsapi_count += 1


async def _place_name_for_surge(surge: dict) -> str | None:
    """Reverse-geocode the surge centroid to a city/place name. Silver records only
    carry country_code/admin_region (a province-level name that rarely appears
    verbatim in headlines) — the centroid lets us recover a more newsworthy city
    name for the NewsAPI query, same as enricher's per-edit geocoding but for a
    single point."""
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


async def _query_newsapi(session: aiohttp.ClientSession, params: dict) -> list[dict]:
    if not _newsapi_allowed():
        logger.warning("NewsAPI daily limit reached — skipping news fetch")
        return []

    try:
        _newsapi_tick()
        async with session.get(NEWSAPI_URL, params=params, timeout=aiohttp.ClientTimeout(total=20)) as resp:
            data = await resp.json()
        articles = data.get("articles") or []
        return [
            {"title": a.get("title"), "url": a.get("url"), "publishedAt": a.get("publishedAt")}
            for a in articles
            if a.get("title")
        ]
    except Exception:
        logger.exception("NewsAPI fetch failed for '%s'", params.get("q"))
        return []


async def _fetch_news(
    session: aiohttp.ClientSession,
    city_name: str | None,
    admin_region: str | None,
) -> list[dict]:
    api_key = os.environ.get("NEWSAPI_KEY", "")
    if not api_key:
        return []

    # OR (not AND) so either name alone can match — admin_region is often an
    # obscure/transliterated province name that rarely appears verbatim in a
    # headline, but the city usually does.
    terms = list(dict.fromkeys(t for t in (city_name, admin_region) if t))
    if not terms:
        return []
    query = " OR ".join(f'"{t}"' for t in terms)
    since = (datetime.now(timezone.utc) - timedelta(hours=48)).strftime("%Y-%m-%dT%H:%M:%SZ")

    base_params = {
        "q":        query,
        "from":     since,
        "sortBy":   "relevancy",
        "pageSize": "5",
        "apiKey":   api_key,
        "searchIn": "title,description",
    }

    # Most surges cluster in non-English-speaking regions, so local coverage often
    # only surfaces once the language filter is dropped. Try English first (cleaner
    # input for the summarization prompt), and only retry without it when the first
    # pass comes back empty — avoids doubling NewsAPI spend on every surge.
    articles = await _query_newsapi(session, {**base_params, "language": "en"})
    if not articles:
        articles = await _query_newsapi(session, base_params)
    return articles


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
        f"Heuristic: 1-2 unique mappers combined with a high building/road percentage "
        f"usually indicates a bulk import or one dedicated mapper working alone, not an "
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
        headlines = await _fetch_news(
            session,
            city_name,
            surge.get("admin_region"),
        )
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
