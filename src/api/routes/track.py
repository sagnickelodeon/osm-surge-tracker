"""
Visitor tracking endpoint.

The dashboard fires a one-shot beacon per page load, via the Next.js proxy. Auth is
handled centrally by SecretGateMiddleware, so any request reaching this handler is
already the trusted proxy — meaning we can believe the real IP it forwards in
`x-client-ip` (not the forgeable X-Forwarded-For).

When TRACK_SECRET is unset the gate is off, so we record nothing: without the secret
we can't trust x-client-ip, and dropping best-effort analytics is the safe default.
See api/visitors.py for the buffer and hourly blob flush.
"""

import logging

from fastapi import APIRouter, Request, Response

from api import visitors
from api.auth import API_SECRET
from api.ratelimit import limiter

logger = logging.getLogger(__name__)

router = APIRouter(tags=["track"])


@router.post("", status_code=204)
@limiter.limit("60/minute")
async def track(request: Request) -> Response:
    """Record one page-view beacon. Always 204, even when it records nothing."""
    # Gate off -> unauthenticated caller, so we can't trust the forwarded IP; drop it.
    if not API_SECRET:
        return Response(status_code=204)

    ip = request.headers.get("x-client-ip", "").strip() or "unknown"
    user_agent = request.headers.get("user-agent", "")
    visitors.record_visit(ip, user_agent)
    return Response(status_code=204)
