"use client";

/**
 * Top-of-page header: product title, last-updated stamp, tutorial/feedback buttons,
 * and four metric tiles.
 */

import { Stats } from "@/lib/api";
import { BORDER, CARD_BG_ALT, TEXT_DARK, TEXT_MID } from "@/lib/config";

const iconBtn: React.CSSProperties = {
  background: "transparent",
  border: `1px solid #2A2D35`,
  borderRadius: 4,
  color: TEXT_MID,
  cursor: "pointer",
  fontSize: "0.72rem",
  letterSpacing: "0.06em",
  padding: "0.25rem 0.6rem",
  transition: "border-color 0.15s, color 0.15s",
};

function Tile({ value, label }: { value: string; label: string }) {
  return (
    <div
      style={{
        background: CARD_BG_ALT,
        border: `1px solid ${BORDER}`,
        borderRadius: 6,
        padding: "1rem",
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: "1.8rem", fontWeight: 700, color: "#FFFFFF" }}>{value}</div>
      <div
        style={{
          fontSize: "0.7rem",
          color: TEXT_DARK,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          marginTop: "0.25rem",
        }}
      >
        {label}
      </div>
    </div>
  );
}

export default function Header({
  stats,
  lastUpdated,
  onTutorial,
  onFeedback,
}: {
  stats: Stats;
  lastUpdated: string;
  onTutorial: () => void;
  onFeedback: () => void;
}) {
  const peak = stats.highest_magnitude_today;
  const peakDisplay = peak != null ? `${peak.toFixed(1)}×` : "—";
  const editsDisplay = (stats.edits_last_hour ?? 0).toLocaleString("en-US");

  const tiles: [string, string][] = [
    [String(stats.total_surges_today ?? 0), "SURGES TODAY"],
    [String(stats.countries_affected ?? 0), "COUNTRIES"],
    [peakDisplay, "PEAK MAGNITUDE"],
    [editsDisplay, "EDITS / HOUR"],
  ];

  return (
    <div>
      {/* title bar */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          borderBottom: "1px solid #333",
          paddingBottom: "0.5rem",
          marginBottom: "1rem",
        }}
      >
        <span
          style={{
            fontSize: "1.1rem",
            fontWeight: 700,
            letterSpacing: "0.15em",
            color: "#FFFFFF",
          }}
        >
          OSM SURGE TRACKER
        </span>

        {/* right side: IST stamp + action buttons */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
          <span style={{ fontSize: "0.75rem", color: TEXT_MID }}>
            LIVE&nbsp;·&nbsp;Updated {lastUpdated} IST
          </span>
          <button
            onClick={onTutorial}
            style={iconBtn}
            title="How to use"
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = "#4a4d55";
              (e.currentTarget as HTMLButtonElement).style.color = "#CCCCCC";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = "#2A2D35";
              (e.currentTarget as HTMLButtonElement).style.color = TEXT_MID;
            }}
          >
            ? How to use
          </button>
          <button
            onClick={onFeedback}
            style={iconBtn}
            title="Send feedback"
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = "#4a4d55";
              (e.currentTarget as HTMLButtonElement).style.color = "#CCCCCC";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = "#2A2D35";
              (e.currentTarget as HTMLButtonElement).style.color = TEXT_MID;
            }}
          >
            ✉ Feedback
          </button>
        </div>
      </div>

      {/* metric tiles */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: "1rem",
        }}
      >
        {tiles.map(([value, label]) => (
          <Tile key={label} value={value} label={label} />
        ))}
      </div>
    </div>
  );
}
