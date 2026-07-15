"""
Tiny in-process response cache for the public GET read endpoints.

The data behind /surges, /heatmap and /stats only changes when a new Parquet snapshot
lands (~every 60s), so serving a cached copy for a few seconds costs no correctness but
spares the single DuckDB connection from re-running a query on every poll. Safe as a
plain dict: the API is one process / one event loop, and a request never yields between
the cache lookup and the store.

It also stamps the `Cache-Control` that Vercel's edge reads (see the dashboard's
osm/[...path] proxy), so the TTL is defined **once**, here.

Registered *inside* the secret gate (see main.py) so a cached body is only ever served
to a gate-authorised caller — an unauthenticated direct hit is 404'd before it reaches
this middleware.
"""

import time

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

# Seconds a response is served from cache before the next request re-runs the query.
# Also the shared-cache (CDN/edge) freshness window via s-maxage below.
TTL_SECONDS = 15

# What the shared (Vercel edge / CDN) cache is told. stale-while-revalidate lets the edge
# serve a slightly-stale copy instantly while it refreshes once in the background, so a
# window rollover can't stampede the origin with simultaneous misses.
CACHE_CONTROL = f"public, s-maxage={TTL_SECONDS}, stale-while-revalidate=60"

# Only these read paths are cached; writes (/track, /feedback) and /health are not.
_CACHEABLE_PREFIXES = ("/surges", "/heatmap", "/stats")

# Cap on distinct cache keys, so a client varying query params can't grow the dict
# without bound.
_MAX_ENTRIES = 256

# key ("path?query") -> (expiry_monotonic, status, body, media_type)
_cache: dict[str, tuple[float, int, bytes, str | None]] = {}


def _cacheable(request: Request) -> bool:
    return request.method == "GET" and request.url.path.startswith(_CACHEABLE_PREFIXES)


class ResponseCacheMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if not _cacheable(request):
            return await call_next(request)

        key = f"{request.url.path}?{request.url.query}"
        now = time.monotonic()

        hit = _cache.get(key)
        if hit and hit[0] > now:
            _, status, body, media = hit
            return Response(
                content=body,
                status_code=status,
                media_type=media,
                headers={"cache-control": CACHE_CONTROL, "x-cache": "HIT"},
            )

        response = await call_next(request)
        body = b"".join([chunk async for chunk in response.body_iterator])

        if response.status_code == 200:
            if len(_cache) >= _MAX_ENTRIES:
                # Opportunistically drop expired entries; only skip storing if still full.
                for k in [k for k, v in _cache.items() if v[0] <= now]:
                    del _cache[k]
            if len(_cache) < _MAX_ENTRIES:
                _cache[key] = (now + TTL_SECONDS, response.status_code, body, response.media_type)

        headers = dict(response.headers)
        headers["cache-control"] = CACHE_CONTROL
        headers["x-cache"] = "MISS"
        headers.pop("content-length", None)  # body was re-buffered; let Starlette recompute
        return Response(content=body, status_code=response.status_code, headers=headers)
