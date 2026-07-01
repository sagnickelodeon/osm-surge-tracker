/**
 * Server-side proxy to the FastAPI backend.
 *
 * The browser calls same-origin /api/osm/<path>; we forward it to API_BASE_URL/<path>
 * from the server. Because the fetch is server-side, the backend can be plain HTTP even
 * when the page is HTTPS (no mixed content). Read-only, so only GET is proxied; any
 * upstream failure becomes a 502 that the client helpers turn into safe empty values.
 *
 * We attach the shared TRACK_SECRET (see src/api/auth.py) on every read so the gated API
 * accepts us. When it's unset (dev) the gate is off too, so reads work without it.
 */

import { NextRequest, NextResponse } from "next/server";

// `||`, not a default, so a blank API_BASE_URL= still resolves to the localhost default.
const API_BASE_URL = process.env.API_BASE_URL || "http://localhost:8000";

// Authenticates this proxy to the gated API; must match the backend's TRACK_SECRET.
const TRACK_SECRET = process.env.TRACK_SECRET || "";

// Server-side, never cached — the dashboard wants fresh data each poll.
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  // params is a Promise in Next 15, a plain object in Next 14; await handles both.
  const { path } = await params;
  const target = `${API_BASE_URL}/${path.join("/")}${req.nextUrl.search}`;

  try {
    const upstream = await fetch(target, {
      headers: {
        accept: "application/json",
        // Omitted when unset (dev) — the gate is then disabled, so reads still succeed.
        ...(TRACK_SECRET ? { "x-track-secret": TRACK_SECRET } : {}),
      },
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    const body = await upstream.text();
    return new NextResponse(body, {
      status: upstream.status,
      headers: {
        "content-type": upstream.headers.get("content-type") ?? "application/json",
        "cache-control": "no-store",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Upstream API unavailable" },
      { status: 502, headers: { "cache-control": "no-store" } },
    );
  }
}
