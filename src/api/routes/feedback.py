"""
Feedback endpoint: appends one entry to <container>/updates/feedback.json.

Same trust model as /track — the central secret gate authenticates the caller (the
dashboard proxy), and the write is rate-limited per client IP. Storage is best-effort:
the endpoint returns 204 even when Azure is unconfigured or the blob write fails, so
the UI can always show a success state (feedback is non-critical).
"""

import logging

from fastapi import APIRouter, Request, Response
from pydantic import BaseModel, Field

from api import feedback
from api.ratelimit import limiter

logger = logging.getLogger(__name__)

router = APIRouter(tags=["feedback"])


class FeedbackIn(BaseModel):
    """One feedback submission from the dashboard modal."""

    name: str = Field(default="", max_length=200)
    email: str = Field(default="", max_length=254)   # optional contact address
    type: str = Field(default="General Feedback", max_length=100)
    feedback: str = Field(min_length=1, max_length=5000)


@router.post("", status_code=204)
@limiter.limit("4/minute")
async def submit_feedback(request: Request, body: FeedbackIn) -> Response:
    """Append one feedback entry to the blob. Always 204 (best-effort storage).

    Rate limited per client IP (4/min, slowapi); feedback.py adds a process-wide
    write ceiling on top, so a distributed flood can't amplify blob writes.
    """
    await feedback.record_feedback(body.name, body.email, body.type, body.feedback)
    return Response(status_code=204)
