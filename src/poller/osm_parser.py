import gzip
import os
import tempfile
import uuid

import osmium


class OSMChangeHandler(osmium.SimpleHandler):
    def __init__(self, sequence_number: int):
        super().__init__()
        self.events: list[dict] = []
        self._seq = sequence_number

    def _action(self, obj) -> str:
        if obj.deleted:
            return "delete"
        return "create" if obj.version == 1 else "modify"

    def _tags(self, obj) -> dict:
        return {tag.k: tag.v for tag in obj.tags}

    def _ts(self, obj) -> str:
        # strftime avoids isoformat's +00:00 suffix and microseconds
        return obj.timestamp.strftime("%Y-%m-%dT%H:%M:%SZ")

    def _make_event(self, obj, osm_type: str, lat=None, lon=None) -> dict:
        return {
            "event_id": str(uuid.uuid4()),
            "sequence_number": self._seq,
            "timestamp": self._ts(obj),
            "edit_type": self._action(obj),
            "osm_type": osm_type,
            "osm_id": obj.id,
            "lat": lat,
            "lon": lon,
            "changeset_id": obj.changeset,
            "user": obj.user,
            "tags": self._tags(obj),
        }

    def node(self, n):
        lat = lon = None
        if n.location.valid():
            lat = n.location.lat
            lon = n.location.lon
        self.events.append(self._make_event(n, "node", lat, lon))

    def way(self, w):
        self.events.append(self._make_event(w, "way"))

    def relation(self, r):
        self.events.append(self._make_event(r, "relation"))


def parse_osc_bytes(data: bytes, sequence_number: int) -> list[dict]:
    """
    Accept raw .osc.gz bytes, parse with pyosmium, return a list of edit event dicts.
    Ways and relations have lat=None, lon=None (no direct coordinates in OSC format).
    """
    raw_xml = gzip.decompress(data)

    # pyosmium needs a file path, not a buffer; temp file must be closed before apply_file
    tmp = tempfile.NamedTemporaryFile(suffix=".osc", delete=False)
    try:
        tmp.write(raw_xml)
        tmp.close()
        handler = OSMChangeHandler(sequence_number)
        handler.apply_file(tmp.name)
    finally:
        os.unlink(tmp.name)

    return handler.events
