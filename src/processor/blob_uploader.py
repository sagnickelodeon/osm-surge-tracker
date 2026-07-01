"""
Azure Blob archive for the silver and gold medallion layers.

Hourly, exports the just-completed hour of silver and gold into a time-partitioned
history in the container:

    <container>/silver/dt=YYYY-MM-DD/HH.parquet
    <container>/gold/dt=YYYY-MM-DD/HH.parquet

Best-effort: if Azure is unconfigured or an upload fails, the processor logs and
carries on. Config (secret.env): AZURE_STORAGE_CONNECTION_STRING, AZURE_BLOB_CONTAINER.
"""

import asyncio
import logging
import os
import shutil
import tempfile
from datetime import datetime, timedelta
from pathlib import Path

import duckdb

from timeutil import now_ist

logger = logging.getLogger(__name__)

# Archive cadence: once per hour, exporting the hour that just completed.
ARCHIVE_INTERVAL = 1

_CONN_STR_ENV = "AZURE_STORAGE_CONNECTION_STRING"
_CONTAINER_ENV = "AZURE_BLOB_CONTAINER"

# (layer name, source table, timestamp column used to slice the hour).
_LAYERS: list[tuple[str, str, str]] = [
    ("silver", "silver_windowed_edits", "window_start"),
    ("gold", "gold_surges", "detected_at"),
]

# Built once on first use; reused thereafter. None until the first upload.
_container_client = None


def is_configured() -> bool:
    """True only when both the connection string and the container name are set."""
    return bool(os.environ.get(_CONN_STR_ENV)) and bool(os.environ.get(_CONTAINER_ENV))


def _get_container_client():
    """
    Lazily build and cache the ContainerClient.

    The azure SDK is imported here so the dependency is only needed when archiving
    is configured — local dev works without azure-storage-blob installed.
    """
    global _container_client
    if _container_client is None:
        from azure.storage.blob import BlobServiceClient

        service = BlobServiceClient.from_connection_string(os.environ[_CONN_STR_ENV])
        _container_client = service.get_container_client(os.environ[_CONTAINER_ENV])
        # Idempotent create; ignore if it exists or we lack permission — real
        # uploads surface errors.
        try:
            _container_client.create_container()
        except Exception:
            pass
    return _container_client


def upload_file(local_path: Path, blob_name: str) -> None:
    """Upload a local file to <container>/<blob_name> as a block blob (overwrite)."""
    client = _get_container_client()
    with open(local_path, "rb") as fh:
        client.upload_blob(name=blob_name, data=fh, overwrite=True)
    logger.info("Archived %s -> %s", local_path.name, blob_name)


def _export_hour(
    conn: duckdb.DuckDBPyConnection,
    hour_start: datetime,
    hour_end: datetime,
    tmpdir: Path,
) -> list[tuple[Path, str]]:
    """
    Export each layer's rows for [hour_start, hour_end) to a temp Parquet file.

    Runs synchronously on the event loop so it can't interleave with other coroutines
    on the shared connection; only the slow upload is off-loaded to a thread by the
    caller. Returns (local_path, blob_name) pairs to upload.
    """
    date_str = hour_start.strftime("%Y-%m-%d")
    hh = hour_start.strftime("%H")
    exports: list[tuple[Path, str]] = []

    for layer, table, ts_col in _LAYERS:
        tmp = tmpdir / f"{layer}_{date_str}_{hh}.parquet"
        # table/ts_col are constants; the hour bounds are bound "?" params (naive IST).
        conn.execute(
            f"COPY (SELECT * FROM {table} WHERE {ts_col} >= ? AND {ts_col} < ?) "
            f"TO '{tmp.as_posix()}' (FORMAT PARQUET)",
            [hour_start, hour_end],
        )
        exports.append((tmp, f"{layer}/{date_str}/{hh}.parquet"))

    return exports


async def archive_loop(conn: duckdb.DuckDBPyConnection) -> None:
    """
    Hourly, archive the just-completed hour's silver & gold rows to Azure Blob.

    Aligns to the top of the hour for a clean [HH:00, HH+1:00) slice. Returns
    immediately if Azure isn't configured.
    """
    if not is_configured():
        logger.info(
            "Azure Blob archive not configured (%s / %s unset) — "
            "silver/gold archiving disabled.",
            _CONN_STR_ENV,
            _CONTAINER_ENV,
        )
        return

    logger.info("Silver/gold hourly Azure Blob archive enabled")

    while True:
        # Sleep until the next top-of-hour boundary.
        now = now_ist()
        next_hour = now.replace(minute=0, second=0, microsecond=0) + timedelta(hours=ARCHIVE_INTERVAL)
        await asyncio.sleep(max(1.0, (next_hour - now).total_seconds()))

        # The hour that just completed is [next_hour - 1h, next_hour).
        hour_start = next_hour - timedelta(hours=ARCHIVE_INTERVAL)
        hour_end = next_hour

        try:
            tmpdir = Path(tempfile.mkdtemp(prefix="osm_archive_"))
            try:
                exports = _export_hour(conn, hour_start, hour_end, tmpdir)
                for local_path, blob_name in exports:
                    await asyncio.to_thread(upload_file, local_path, blob_name)
            finally:
                shutil.rmtree(tmpdir, ignore_errors=True)
        except Exception:
            logger.exception(
                "Silver/gold archive for hour %s failed — will retry next hour",
                hour_start,
            )
