import logging

import redis
from redis.exceptions import ResponseError

STREAM_RAW      = "osm:raw"
STREAM_ENRICHED = "osm:enriched"
STREAM_SURGES   = "osm:surges"

GROUP_PROCESSOR = "processor-group"
GROUP_EXPLAINER = "explainer-group"

logger = logging.getLogger(__name__)


def setup_consumer_group(
    redis_client: redis.Redis,
    stream: str,
    group: str,
    start_id: str = "0",
) -> None:
    try:
        redis_client.xgroup_create(stream, group, id=start_id, mkstream=True)
        logger.info("Created consumer group '%s' on stream '%s'", group, stream)
    except ResponseError as e:
        if "BUSYGROUP" in str(e):
            logger.debug("Consumer group '%s' already exists on '%s'", group, stream)
        else:
            raise


def read_messages(
    redis_client: redis.Redis,
    stream: str,
    group: str,
    consumer: str,
    count: int = 100,
    block_ms: int = 1000,
) -> list[tuple[str, dict[str, str]]]:
    result = redis_client.xreadgroup(
        groupname=group,
        consumername=consumer,
        streams={stream: ">"},
        count=count,
        block=block_ms,
    )

    if not result:
        return []

    # result shape (redis-py 5.x): [[stream_name, [(msg_id, {field: value}), ...]], ...]
    messages = []
    for _stream_name, entries in result:
        for msg_id, fields in entries:
            messages.append((msg_id, fields))

    return messages


def ack_message(
    redis_client: redis.Redis,
    stream: str,
    group: str,
    message_id: str,
) -> None:
    try:
        redis_client.xack(stream, group, message_id)
    except Exception:
        logger.exception("Failed to ACK message %s on %s/%s", message_id, stream, group)
