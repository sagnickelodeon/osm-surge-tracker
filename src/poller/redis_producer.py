import json
import logging

import redis

logger = logging.getLogger(__name__)

STREAM_KEY = "osm:raw"
STREAM_MAXLEN = 500_000


class RedisProducer:
    def __init__(self, host: str = "localhost", port: int = 6379):
        # socket_connect_timeout / socket_timeout are essential: without them a host
        # that accepts the TCP connection but never replies (e.g. a broken Docker/WSL
        # port relay) makes ping() and every command block *forever* with no output.
        # With a timeout the call fails fast and the caller can log + abort.
        self._client = redis.Redis(
            host=host,
            port=port,
            decode_responses=True,
            socket_connect_timeout=5,
            socket_timeout=5,
        )
        self._host = host
        self._port = port

    def ping(self) -> bool:
        try:
            return bool(self._client.ping())
        except redis.RedisError:
            return False

    def push_events(self, events: list[dict]) -> int:
        """Push a batch of event dicts to the Redis Stream. Returns number of events pushed."""
        if not events:
            return 0
        pipe = self._client.pipeline(transaction=False)
        for event in events:
            fields = {k: self._serialize(v) for k, v in event.items()}
            pipe.xadd(STREAM_KEY, fields, maxlen=STREAM_MAXLEN, approximate=True)
        pipe.execute()
        return len(events)

    def _serialize(self, v) -> str:
        """Convert Python values to Redis-compatible strings."""
        if v is None:
            return "null"
        if isinstance(v, (dict, list)):
            return json.dumps(v)
        return str(v)
