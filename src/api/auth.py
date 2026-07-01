"""
Central API access gate.

The only legitimate caller is the Next.js server-side proxy, which holds the shared
secret TRACK_SECRET and sends it as `x-track-secret` on every forwarded request.
This middleware rejects anything without it, so hitting the VM's port directly gets
nowhere.

  - TRACK_SECRET set   -> every endpoint except EXEMPT_PATHS needs a matching header
    (constant-time compare). Missing/wrong -> 404 (not 401/403, so the gate stays
    invisible to probes).
  - TRACK_SECRET unset  -> gate disabled, all requests pass (frictionless local dev).
  - /health is always exempt so liveness probes work without the secret.
"""

import hmac
import logging
import os

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

logger = logging.getLogger(__name__)

# Shared secret the proxy sends in `x-track-secret`. Empty = gate disabled (dev).
API_SECRET = os.environ.get("TRACK_SECRET", "")

# "production" is fail-closed (see the guard below); "development" (default) allows
# the gate to be left disabled for local dev.
APP_ENV = os.environ.get("APP_ENV", "development").lower()

# Liveness probes call this without the secret.
EXEMPT_PATHS = {"/health"}

# Fail closed in production: refuse to boot with the gate disabled, rather than
# silently exposing every endpoint. Raising at import stops uvicorn from binding.
if APP_ENV == "production" and not API_SECRET:
    raise RuntimeError(
        "TRACK_SECRET must be set when APP_ENV=production — refusing to start with the "
        "API access gate disabled on a public deployment. Set TRACK_SECRET in secret.env "
        "(and the matching value on the dashboard), or run with APP_ENV=development for "
        "local dev where an open API is acceptable."
    )

if not API_SECRET:
    logger.warning(
        "TRACK_SECRET not set — API access gate DISABLED (every endpoint is open, "
        "and POST /track records nothing). Fine for local dev; set TRACK_SECRET in "
        "production to restrict the API to the dashboard proxy."
    )


def secret_ok(request: Request) -> bool:
    """True only when the request carries the correct shared secret (constant-time)."""
    if not API_SECRET:
        return False
    provided = request.headers.get("x-track-secret", "")
    return hmac.compare_digest(provided, API_SECRET)


class SecretGateMiddleware(BaseHTTPMiddleware):
    """Reject any non-exempt request that lacks the shared secret (when configured)."""

    async def dispatch(self, request: Request, call_next):
        if (
            API_SECRET  # only enforce when a secret is actually configured
            and request.url.path not in EXEMPT_PATHS
            and request.method != "OPTIONS"  # never block a CORS preflight
            and not secret_ok(request)
        ):
            # 404, not 401/403: don't reveal that a protected API lives behind this port.
            return JSONResponse({"detail": "Not Found"}, status_code=404)
        return await call_next(request)
