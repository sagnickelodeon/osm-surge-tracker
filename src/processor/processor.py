"""
Component 2 — Stream Processor
Entry point: python processor.py

Environment variables:
  REDIS_HOST           Redis hostname (default: localhost)
  REDIS_PORT           Redis port    (default: 6379)
  PROCESSOR_START_ID   Consumer group start position:
                         "$" = only new messages (default, safe for first deploy)
                         "0" = replay entire stream backlog
  GDELT_API_KEY        GDELT Cloud API key  (optional — surges recorded without news if absent)
  OPENAI_API_KEY       OpenAI API key       (optional — surges recorded without explanation if absent)
"""

import asyncio
import logging
import os
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
load_dotenv(Path(__file__).parent.parent / "secret.env", override=False)

import duckdb
import redis

from aggregator import WindowBuffer, get_current_window
from anomaly_detector import detect_anomalies_loop
from baseline import update_baselines_loop
from blob_uploader import archive_loop
from db import cleanup_old_records, create_tables, get_connection
from enricher import (
    deserialize_raw_fields,
    enrich_batch,
    insert_bronze_batch,
    push_enriched_to_redis,
)
from explainer import explain_surges_loop
from snapshot import snapshot_loop
from timeutil import now_ist
from redis_consumer import (
    GROUP_EXPLAINER,
    GROUP_PROCESSOR,
    STREAM_RAW,
    STREAM_SURGES,
    ack_message,
    read_messages,
    setup_consumer_group,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s — %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%SZ",
)
logger = logging.getLogger(__name__)

CONSUMER_NAME = "processor-1"


async def consume_and_enrich(
    redis_client: redis.Redis,
    conn: duckdb.DuckDBPyConnection,
    window_buffer: WindowBuffer,
) -> None:
    while True:
        try:
            messages = read_messages(
                redis_client,
                STREAM_RAW,
                GROUP_PROCESSOR,
                CONSUMER_NAME,
                count=100,
                block_ms=1000,
            )

            if not messages:
                await asyncio.sleep(0)
                continue

            raw_events: list[dict[str, Any]] = []
            msg_ids:    list[str] = []

            for msg_id, fields in messages:
                try:
                    raw_events.append(deserialize_raw_fields(fields))
                    msg_ids.append(msg_id)
                except Exception:
                    logger.exception("Deserialization failed for message %s", msg_id)
                    # ACK bad message so it doesn't block the group indefinitely
                    ack_message(redis_client, STREAM_RAW, GROUP_PROCESSOR, msg_id)

            if not raw_events:
                continue

            enriched = await enrich_batch(raw_events)

            try:
                insert_bronze_batch(conn, enriched)
            except Exception:
                logger.exception("Bronze insert failed — will retry on next batch")
                # Do not ACK; Redis will redeliver on next xreadgroup call
                continue

            try:
                push_enriched_to_redis(redis_client, enriched)
            except Exception:
                logger.exception("Push to osm:enriched failed — continuing")

            for event in enriched:
                window_buffer.add_event(event)

            for msg_id in msg_ids:
                ack_message(redis_client, STREAM_RAW, GROUP_PROCESSOR, msg_id)

        except Exception:
            logger.exception("consume_and_enrich error — retrying in 5s")
            await asyncio.sleep(5)


async def flush_windows_loop(
    conn: duckdb.DuckDBPyConnection,
    window_buffer: WindowBuffer,
    anomaly_queue: asyncio.Queue,
) -> None:
    _, current_window_end = get_current_window()

    while True:
        try:
            await asyncio.sleep(10)

            now = now_ist()
            if now < current_window_end:
                continue

            window_start, window_end = get_current_window()
            # The window that just ended is (current_window_end - 5min, current_window_end)
            from datetime import timedelta
            flush_start = current_window_end - timedelta(minutes=5)
            flush_end   = current_window_end

            records = window_buffer.flush(conn, flush_start, flush_end)

            if records:
                await anomaly_queue.put(records)

            current_window_end = window_end

        except Exception:
            logger.exception("flush_windows_loop error — retrying in 10s")
            await asyncio.sleep(10)


async def cleanup_loop(conn: duckdb.DuckDBPyConnection) -> None:
    # Run once at startup, then every 24 hours
    while True:
        try:
            cleanup_old_records(conn)
        except Exception:
            logger.exception("Cleanup failed")
        await asyncio.sleep(86_400)


async def main() -> None:
    redis_host   = os.environ.get("REDIS_HOST", "localhost")
    redis_port   = int(os.environ.get("REDIS_PORT", "6379"))
    start_id     = os.environ.get("PROCESSOR_START_ID", "$")

    logger.info("Connecting to Redis at %s:%d", redis_host, redis_port)
    redis_client = redis.Redis(
        host=redis_host,
        port=redis_port,
        decode_responses=True,
    )

    # Verify Redis is reachable before starting
    try:
        redis_client.ping()
    except Exception as exc:
        logger.error("Cannot reach Redis: %s", exc)
        raise SystemExit(1)

    logger.info("Opening DuckDB")
    conn = get_connection()
    create_tables(conn)

    setup_consumer_group(redis_client, STREAM_RAW,    GROUP_PROCESSOR, start_id=start_id)
    setup_consumer_group(redis_client, STREAM_SURGES, GROUP_EXPLAINER, start_id=start_id)

    window_buffer: WindowBuffer   = WindowBuffer()
    anomaly_queue: asyncio.Queue  = asyncio.Queue()

    # Pre-warm the geocoder's ~2.4M-city KD-tree here, in a worker thread — otherwise
    # the first batch would load it inline and stall the event loop.
    logger.info("Pre-loading geocoder database — first run can take ~30s…")
    import reverse_geocoder as rg
    await asyncio.to_thread(rg.search, [(0.0, 0.0)], mode=1)
    logger.info("Geocoder ready")

    logger.info("Starting all coroutines (start_id=%s)", start_id)

    await asyncio.gather(
        consume_and_enrich(redis_client, conn, window_buffer),
        flush_windows_loop(conn, window_buffer, anomaly_queue),
        update_baselines_loop(conn),
        detect_anomalies_loop(conn, redis_client, anomaly_queue),
        explain_surges_loop(redis_client, conn),
        cleanup_loop(conn),
        snapshot_loop(conn),   # exports Parquet snapshots for the FastAPI service to read
        archive_loop(conn),    # hourly silver/gold archive to Azure Blob (no-op if unconfigured)
    )


if __name__ == "__main__":
    asyncio.run(main())
