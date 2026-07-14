/**
 * Client-side fetch helpers for the dashboard.
 *
 * The browser hits same-origin /api/osm/*, which the server-side proxy forwards to the
 * FastAPI backend (so the backend can stay plain-HTTP behind an HTTPS page). Every fetch
 * degrades to a safe empty value on failure, so an unreachable API shows empty/stale
 * data rather than crashing the page.
 */

export interface NewsItem {
  title: string;
  url?: string | null;
  publishedAt?: string | null;
}

export interface Surge {
  surge_id: string;
  detected_at: string; // ISO 8601 with +05:30 offset
  country_code?: string | null;
  admin_region?: string | null;
  window_start: string;
  window_end: string;
  edit_count: number;
  baseline_mean: number;
  z_score: number; // -1.0 sentinel for cold-start detections
  surge_magnitude: number;
  dominant_tag?: string | null;
  pct_building: number;
  pct_highway: number;
  centroid_lat?: number | null;
  centroid_lon?: number | null;
  explanation: string;
  news_headlines: NewsItem[];
  status: string;
}

export interface HeatmapPoint {
  country_code?: string | null;
  admin_region?: string | null;
  total_edits: number;
  centroid_lat: number;
  centroid_lon: number;
}

export interface Stats {
  total_surges_today: number;
  countries_affected: number;
  highest_magnitude_today: number | null;
  edits_last_hour: number;
  whats_new: string[];
  whats_coming: string[];
}

export const EMPTY_STATS: Stats = {
  total_surges_today: 0,
  countries_affected: 0,
  highest_magnitude_today: null,
  edits_last_hour: 0,
  whats_new: [],
  whats_coming: [],
};

/** Build a same-origin proxy URL: /api/osm/<path>?<query>. */
function proxyUrl(path: string, params?: Record<string, string | number>): string {
  const qs = params
    ? "?" +
      Object.entries(params)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join("&")
    : "";
  return `/api/osm/${path}${qs}`;
}

/** Single GET with a hard timeout. Throws on failure so SWR keeps the last-good data. */
async function get<T>(path: string, params?: Record<string, string | number>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const r = await fetch(proxyUrl(path, params), { signal: controller.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return (await r.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchActiveSurges(): Promise<Surge[]> {
  const data = await get<Surge[]>("surges/active");
  return Array.isArray(data) ? data : [];
}

export async function fetchSurgeHistory(opts?: {
  days?: number;
  countryCode?: string | null;
  minMagnitude?: number;
  limit?: number;
}): Promise<Surge[]> {
  const params: Record<string, string | number> = {
    days: opts?.days ?? 7,
    min_magnitude: opts?.minMagnitude ?? 3.0,
    limit: opts?.limit ?? 100,
  };
  if (opts?.countryCode != null) params.country_code = opts.countryCode;
  const data = await get<Surge[]>("surges/history", params);
  return Array.isArray(data) ? data : [];
}

export async function fetchHeatmap(): Promise<HeatmapPoint[]> {
  const data = await get<HeatmapPoint[]>("heatmap");
  return Array.isArray(data) ? data : [];
}

export async function fetchStats(): Promise<Stats> {
  const data = await get<Stats>("stats");
  return data && typeof data === "object" ? data : { ...EMPTY_STATS };
}
