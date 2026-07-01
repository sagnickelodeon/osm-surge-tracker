/**
 * IST time helpers. All displayed times are IST (UTC+5:30) regardless of the viewer's
 * host timezone.
 */

const IST_TZ = "Asia/Kolkata";

const CLOCK_FMT = new Intl.DateTimeFormat("en-GB", {
  timeZone: IST_TZ,
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

const HISTORY_FMT = new Intl.DateTimeFormat("en-US", {
  timeZone: IST_TZ,
  month: "short",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** Current IST wall-clock as "HH:MM:SS". */
export function nowIST(): string {
  return CLOCK_FMT.format(new Date());
}

/** "12m ago" / "3h 5m ago" from an ISO timestamp; "" if unparseable. */
export function minsAgo(detectedAt: string | null | undefined): string {
  if (!detectedAt) return "";
  const t = Date.parse(detectedAt);
  if (Number.isNaN(t)) return "";
  const delta = Math.floor((Date.now() - t) / 60000);
  if (delta < 0) return "0m ago";
  if (delta < 60) return `${delta}m ago`;
  return `${Math.floor(delta / 60)}h ${delta % 60}m ago`;
}

/** "Jun 28 14:30" (IST) from an ISO timestamp; first 16 chars as a fallback. */
export function fmtHistoryTime(s: string | null | undefined): string {
  if (!s) return "";
  const t = Date.parse(s);
  if (Number.isNaN(t)) return s.slice(0, 16);
  // Intl yields "Jun 28, 14:30" — drop the comma.
  return HISTORY_FMT.format(new Date(t)).replace(",", "");
}
