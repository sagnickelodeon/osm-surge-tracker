"""
Azure Blob append-log helper for the API's hourly visitor log.

Separate from the processor's blob_uploader.py so the API stays independently
deployable. Appends text lines to an *append* blob (vs the processor's block blobs):

    <container>/logs/visits-YYYY-MM-DD.log   (one JSON line per hour)

Best-effort: if Azure is unconfigured or an append fails, the API logs and carries on.
Config (secret.env): AZURE_STORAGE_CONNECTION_STRING, AZURE_BLOB_CONTAINER.
"""

import logging
import os

logger = logging.getLogger(__name__)

_CONN_STR_ENV = "AZURE_STORAGE_CONNECTION_STRING"
_CONTAINER_ENV = "AZURE_BLOB_CONTAINER"

# Built once on first use; reused thereafter. None until the first append.
_container_client = None


def is_configured() -> bool:
    """True only when both the connection string and the container name are set."""
    return bool(os.environ.get(_CONN_STR_ENV)) and bool(os.environ.get(_CONTAINER_ENV))


def _get_container_client():
    """Lazily build and cache the ContainerClient. The azure SDK is imported here so
    it's only needed when visitor logging is configured."""
    global _container_client
    if _container_client is None:
        from azure.storage.blob import BlobServiceClient

        service = BlobServiceClient.from_connection_string(os.environ[_CONN_STR_ENV])
        _container_client = service.get_container_client(os.environ[_CONTAINER_ENV])
        try:
            _container_client.create_container()
        except Exception:
            pass  # already exists / no create permission — appends surface real errors
    return _container_client


def append_line(blob_name: str, text: str) -> None:
    """
    Append one line to <container>/<blob_name>, creating the blob on first use.

    Synchronous network I/O — callers run it off the event loop via asyncio.to_thread.
    """
    client = _get_container_client()
    blob = client.get_blob_client(blob_name)
    if not blob.exists():
        # create_append_blob fails if the blob already exists — guard with exists().
        blob.create_append_blob()
    blob.append_block((text + "\n").encode("utf-8"))
    logger.info("Appended visitor log line to %s", blob_name)


def read_text(blob_name: str) -> str | None:
    """
    Read the whole UTF-8 text blob <container>/<blob_name>.

    Returns None when Azure is unconfigured, the blob is missing, or a read fails —
    callers treat None as "no content" (best-effort, never raises). Synchronous
    network I/O — run off the event loop via asyncio.to_thread.
    """
    if not is_configured():
        return None
    try:
        client = _get_container_client()
        blob = client.get_blob_client(blob_name)
        if not blob.exists():
            return None
        return blob.download_blob().readall().decode("utf-8")
    except Exception:
        logger.exception("Failed to read blob %s", blob_name)
        return None
