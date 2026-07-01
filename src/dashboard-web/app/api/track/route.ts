/**
 * Visitor-tracking beacon proxy.
 *
 * The dashboard POSTs an empty beacon here once per page load; we forward it to the
 * backend's POST /track. Trust model (the API is public, no reverse proxy):
 *   - We authenticate with the shared TRACK_SECRET (`x-track-secret`), so a client can't
 *     forge visits by hitting the API port directly.
 *   - We take the visitor IP from `x-real-ip` (Vercel-set, non-spoofable), NOT the
 *     client-supplied `x-forwarded-for`, and pass it on as `x-client-ip`.
 */

import { NextRequest, NextResponse } from "next/server";

const API_BASE_URL = process.env.API_BASE_URL || "http://localhost:8000";
const TRACK_SECRET = process.env.TRACK_SECRET || "";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  // x-real-ip is Vercel-set and non-spoofable; we don't trust x-forwarded-for.
  const ip = req.headers.get("x-real-ip") ?? "";
  const userAgent = req.headers.get("user-agent") ?? "";

  // The API would drop the beacon without the secret anyway; skip the round-trip.
  if (!TRACK_SECRET) {
    return new NextResponse(null, { status: 204 });
  }

  try {
    await fetch(`${API_BASE_URL}/track`, {
      method: "POST",
      headers: {
        "x-track-secret": TRACK_SECRET,
        "x-client-ip": ip,
        "user-agent": userAgent,
      },
      signal: AbortSignal.timeout(5_000),
      cache: "no-store",
    });
  } catch {
    // Best-effort; never surface a failure to the visitor.
  }
  // Always 204 — the beacon must never affect the page.
  return new NextResponse(null, { status: 204 });
}
