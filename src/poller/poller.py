import logging
import os
import time
from pathlib import Path

from dotenv import load_dotenv
load_dotenv(Path(__file__).parent.parent / "secret.env", override=False)

import requests

from osm_parser import parse_osc_bytes
from redis_producer import RedisProducer

POLL_INTERVAL = 60
BASE_URL = "https://planet.openstreetmap.org/replication/minute"
STATE_FILE = Path(__file__).parent / "state.txt"

# Cap how far back a restart will replay. The dashboard only serves recent data
# (the heatmap looks back 1h), so replaying a long backlog after downtime is both
# pointless and harmful — it floods the pipeline with stale edits that no query
# window sees and that retention soon deletes. If the gap exceeds this many diffs
# (~1h of minutely files), skip the stale history and resume near the live head.
MAX_CATCHUP = 60

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%SZ",
)
logger = logging.getLogger(__name__)


def seq_to_url(seq: int) -> str:
    path = f"{seq:09d}"
    return f"{BASE_URL}/{path[0:3]}/{path[3:6]}/{path[6:9]}.osc.gz"


def fetch_remote_state() -> int:
    """Return the latest available sequence number from the OSM replication server."""
    resp = requests.get(f"{BASE_URL}/state.txt", timeout=30)
    resp.raise_for_status()
    for line in resp.text.splitlines():
        if line.startswith("sequenceNumber"):
            return int(line.split("=")[1].strip())
    raise ValueError(f"sequenceNumber not found in remote state.txt:\n{resp.text[:300]}")


def read_local_state() -> int | None:
    """Return the last successfully processed sequence number, or None if no state exists."""
    if not STATE_FILE.exists():
        return None
    text = STATE_FILE.read_text().strip()
    return int(text) if text else None


def write_local_state(seq: int) -> None:
    STATE_FILE.write_text(str(seq))


def fetch_osc(seq: int) -> bytes | None:
    """
    Download a minutely diff file. Returns None on 404 (sequence gap — skip gracefully).
    Raises on all other HTTP errors.
    """
    url = seq_to_url(seq)
    resp = requests.get(url, timeout=60)
    if resp.status_code == 404:
        logger.warning("seq=%d not found (404) — skipping: %s", seq, url)
        return None
    resp.raise_for_status()
    return resp.content


def process_sequence(seq: int, producer: RedisProducer) -> int:
    """Download, parse, and push one OSC file. Returns number of events pushed."""
    data = fetch_osc(seq)
    if data is None:
        return 0
    events = parse_osc_bytes(data, sequence_number=seq)
    pushed = producer.push_events(events)
    logger.info("seq=%d: %d events pushed to Redis", seq, pushed)
    return pushed


def main():
    redis_host = os.environ.get("REDIS_HOST", "localhost")
    redis_port = int(os.environ.get("REDIS_PORT", "6379"))

    producer = RedisProducer(host=redis_host, port=redis_port)
    if not producer.ping():
        logger.error("Cannot connect to Redis at %s:%d — aborting", redis_host, redis_port)
        raise SystemExit(1)
    logger.info("Connected to Redis at %s:%d", redis_host, redis_port)

    last_seq = read_local_state()
    if last_seq is None:
        last_seq = fetch_remote_state()
        logger.info("No local state — bootstrapping at seq=%d (will start from next minute)", last_seq)
        write_local_state(last_seq)
    else:
        logger.info("Resuming from seq=%d", last_seq)

    while True:
        try:
            remote_seq = fetch_remote_state()

            if remote_seq > last_seq:
                gap = remote_seq - last_seq
                # After long downtime, don't replay the whole backlog — skip ahead to
                # the last MAX_CATCHUP diffs so we resume near the live head with fresh data.
                if gap > MAX_CATCHUP:
                    skip_to = remote_seq - MAX_CATCHUP
                    logger.warning(
                        "Gap of %d diffs exceeds MAX_CATCHUP=%d — skipping %d stale file(s), resuming at seq=%d",
                        gap, MAX_CATCHUP, skip_to - last_seq, skip_to + 1,
                    )
                    last_seq = skip_to
                    write_local_state(last_seq)
                logger.info("Catching up: seq %d → %d (%d file(s))", last_seq + 1, remote_seq, remote_seq - last_seq)
                for seq in range(last_seq + 1, remote_seq + 1):
                    process_sequence(seq, producer)
                    write_local_state(seq)   # persist after each seq so crash recovery is fine-grained
                    last_seq = seq
            else:
                logger.debug("No new sequences (remote=%d). Sleeping %ds.", remote_seq, POLL_INTERVAL)

            time.sleep(POLL_INTERVAL)

        except KeyboardInterrupt:
            logger.info("Poller stopped by user.")
            break
        except Exception:
            logger.exception("Unhandled error in polling loop — will retry after %ds", POLL_INTERVAL)
            time.sleep(POLL_INTERVAL)


if __name__ == "__main__":
    main()
