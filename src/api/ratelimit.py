"""
App-level rate limiting (no reverse proxy in front of uvicorn).

The NGINX-style per-client throttle is done here with slowapi. Only POST /track is
decorated; read endpoints serve public, edge-cached data and stay unthrottled.

The beacon arrives via the Vercel proxy, so request.client.host is Vercel's egress
IP — useless for per-visitor limiting. We key on the proxy-supplied x-client-ip
instead, falling back to the peer address for anything hitting the port directly.
"""

from fastapi import Request
from slowapi import Limiter


def _track_key(request: Request) -> str:
    """Rate-limit key: the proxy-supplied real client IP, else the peer address."""
    return (
        request.headers.get("x-client-ip")
        or (request.client.host if request.client else "unknown")
    )


# Shared limiter, in-memory moving-window storage (fine for one process).
limiter = Limiter(key_func=_track_key)
