/**
 * Feedback submission proxy.
 *
 * The dashboard POSTs {name, type, feedback} here; we forward it to the backend's
 * POST /feedback (which appends it to updates/feedback.json). Same trust model as the
 * track beacon: we authenticate with the shared TRACK_SECRET (`x-track-secret`) so the
 * API port can't be posted to directly, and pass the visitor IP from Vercel's
 * non-spoofable `x-real-ip` as `x-client-ip` (used for the backend's rate limit).
 */

import { NextRequest, NextResponse } from "next/server";

const API_BASE_URL = process.env.API_BASE_URL || "http://localhost:8000";
const TRACK_SECRET = process.env.TRACK_SECRET || "";

// The largest legitimate submission (feedback 5000 + name/email/type + JSON overhead)
// is well under 8 KB. Reject anything bigger before it reaches the API.
const MAX_BODY_BYTES = 8 * 1024;

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-real-ip") ?? "";

  // Fast reject on a declared oversize body (cheap, before reading it).
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES) {
    return new NextResponse(null, { status: 413 });
  }

  let bodyText = "";
  try {
    bodyText = await req.text();
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  // Guard the actual size too (content-length can be absent or wrong).
  if (bodyText.length > MAX_BODY_BYTES) {
    return new NextResponse(null, { status: 413 });
  }

  try {
    const r = await fetch(`${API_BASE_URL}/feedback`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(TRACK_SECRET ? { "x-track-secret": TRACK_SECRET } : {}),
        "x-client-ip": ip,
      },
      body: bodyText,
      signal: AbortSignal.timeout(8_000),
      cache: "no-store",
    });
    // Surface only success/failure to the browser; never leak the upstream body.
    return new NextResponse(null, { status: r.ok ? 204 : 502 });
  } catch {
    return new NextResponse(null, { status: 502 });
  }
}
