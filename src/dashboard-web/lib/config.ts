/**
 * Dashboard-wide constants: refresh timing, the colour palette, and map defaults.
 */

// How often the page refetches (ms).
export const REFRESH_INTERVAL_MS = 60_000;

// Severity colours (match the surge-magnitude thresholds used by the detector).
export const COLOR_CRITICAL = "#FF4B4B"; // surge_magnitude >= 15
export const COLOR_HIGH = "#FFA500"; // surge_magnitude 8–15
export const COLOR_ELEVATED = "#FFD700"; // surge_magnitude 5–8 (floor = detector's 5× threshold)

// Card surfaces
export const CARD_BG = "#13161C";
export const CARD_BG_ALT = "#1A1D23";
export const BORDER = "#2A2D35";

// Accents for the What's-new / What's-coming panels + their header buttons
// (green = shipped, purple = planned — distinct from the severity palette).
export const ACCENT_NEW = "#3FB950";
export const ACCENT_COMING = "#A371F7";

// Muted text
export const TEXT_DARK = "#666666";
export const TEXT_MID = "#888888";
export const TEXT_LIGHT = "#AAAAAA";

// Page base
export const PAGE_BG = "#0E1117";

// Map
export const MAP_HEIGHT = 720; // taller so the left column fills the space beside the feed
export const MAP_LAT = 20.0;
export const MAP_LON = 0.0;
export const MAP_ZOOM = 2;
// Don't let the user zoom out past the initial framing: further out, MapLibre
// tiles repeated world copies that the daylight overlay doesn't cover, so the
// extra copies show through unshaded.
export const MAP_MIN_ZOOM = 2;

// Free, token-less dark basemap (Carto) — keeps the dashboard zero-secret and zero-cost.
export const MAP_STYLE =
  "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

// Severity → RGBA for map dots (alpha 200 keeps dots readable over the heatmap glow).
export const COLOR_CRITICAL_RGB: [number, number, number, number] = [255, 75, 75, 200];
export const COLOR_HIGH_RGB: [number, number, number, number] = [255, 165, 0, 200];
export const COLOR_ELEVATED_RGB: [number, number, number, number] = [255, 215, 0, 200];

/** Severity colour + label for a surge magnitude. */
export function severity(magnitude: number): { color: string; label: string } {
  if (magnitude >= 15) return { color: COLOR_CRITICAL, label: "CRITICAL" };
  if (magnitude >= 8) return { color: COLOR_HIGH, label: "HIGH" };
  return { color: COLOR_ELEVATED, label: "ELEVATED" };
}

/** Severity RGBA for the map scatter layer. */
export function surgeColorRGB(magnitude: number): [number, number, number, number] {
  if (magnitude >= 15) return COLOR_CRITICAL_RGB;
  if (magnitude >= 8) return COLOR_HIGH_RGB;
  return COLOR_ELEVATED_RGB;
}
