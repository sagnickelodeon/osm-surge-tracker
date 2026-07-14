"use client";

/**
 * Top-of-page header: product title, last-updated stamp, tutorial/feedback buttons,
 * and four metric tiles.
 */

import { useState } from "react";

import { Stats } from "@/lib/api";
import {
  ACCENT_COMING,
  ACCENT_NEW,
  BORDER,
  CARD_BG_ALT,
  TEXT_DARK,
  TEXT_LIGHT,
  TEXT_MID,
} from "@/lib/config";
import InfoTip from "./InfoTip";

// Header action buttons come in three looks:
//   "strong" — the prominent "learn about this" pair (What it is · How to use)
//   "pill"   — the accent-tinted update pair (What's new · What's coming)
//   "ghost"  — the understated default (Feedback)
type NavVariant = "strong" | "pill" | "ghost";

function NavButton({
  onClick,
  title,
  variant,
  accent,
  children,
}: {
  onClick: () => void;
  title: string;
  variant: NavVariant;
  accent?: string;
  children: React.ReactNode;
}) {
  const [hover, setHover] = useState(false);

  const base: React.CSSProperties = {
    cursor: "pointer",
    fontSize: "0.72rem",
    letterSpacing: "0.06em",
    whiteSpace: "nowrap",
    transition: "border-color 0.15s, color 0.15s, background 0.15s",
  };

  let style: React.CSSProperties;
  if (variant === "strong") {
    style = {
      ...base,
      background: hover ? "#22262E" : CARD_BG_ALT,
      border: `1px solid ${hover ? "#5A5E68" : "#3A3E48"}`,
      borderRadius: 4,
      color: hover ? "#FFFFFF" : TEXT_LIGHT,
      fontWeight: 600,
      padding: "0.3rem 0.7rem",
    };
  } else if (variant === "pill") {
    const a = accent ?? TEXT_MID;
    style = {
      ...base,
      background: hover ? `${a}22` : "transparent",
      border: `1px solid ${hover ? a : `${a}66`}`,
      borderRadius: 999,
      color: hover ? "#FFFFFF" : a,
      padding: "0.25rem 0.7rem",
    };
  } else {
    style = {
      ...base,
      background: "transparent",
      border: `1px solid ${hover ? "#4A4D55" : "#2A2D35"}`,
      borderRadius: 4,
      color: hover ? "#CCCCCC" : TEXT_MID,
      padding: "0.25rem 0.6rem",
    };
  }

  return (
    <button
      onClick={onClick}
      title={title}
      style={style}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {children}
    </button>
  );
}

function Tile({ value, label, tip }: { value: string; label: string; tip: string }) {
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
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "0.7rem",
          color: TEXT_DARK,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          marginTop: "0.25rem",
        }}
      >
        {label}
        <InfoTip term={label}>{tip}</InfoTip>
      </div>
    </div>
  );
}

export default function Header({
  stats,
  lastUpdated,
  onWhatIs,
  onTutorial,
  onWhatsNew,
  onWhatsComing,
  onFeedback,
}: {
  stats: Stats;
  lastUpdated: string;
  onWhatIs: () => void;
  onTutorial: () => void;
  onWhatsNew: () => void;
  onWhatsComing: () => void;
  onFeedback: () => void;
}) {
  const peak = stats.highest_magnitude_today;
  const peakDisplay = peak != null ? `${peak.toFixed(1)}×` : "—";
  const editsDisplay = (stats.edits_last_hour ?? 0).toLocaleString("en-US");

  const tiles: { value: string; label: string; tip: string }[] = [
    {
      value: String(stats.total_surges_today ?? 0),
      label: "SURGES TODAY",
      tip: "Regions flagged with an unusual spike in OpenStreetMap editing over the last 24 hours.",
    },
    {
      value: String(stats.countries_affected ?? 0),
      label: "COUNTRIES",
      tip: "How many different countries those surges happened in.",
    },
    {
      value: peakDisplay,
      label: "PEAK MAGNITUDE",
      tip: "The biggest surge in the last 24 hours, as a multiple of that region's normal edit volume. 12× means twelve times its usual activity.",
    },
    {
      value: editsDisplay,
      label: "EDITS / HOUR",
      tip: "Total OpenStreetMap edits processed worldwide in the last hour.",
    },
  ];

  return (
    <div>
      {/* title bar */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "1.5rem",
          flexWrap: "wrap",
          borderBottom: "1px solid #333",
          paddingBottom: "0.5rem",
          marginBottom: "1rem",
        }}
      >
        {/* Title + an always-visible tagline: a visitor who never opens the tutorial
            still learns what this site is within a few seconds. */}
        <div style={{ minWidth: 0, maxWidth: 620 }}>
          <div
            style={{
              fontSize: "1.1rem",
              fontWeight: 700,
              letterSpacing: "0.15em",
              color: "#FFFFFF",
            }}
          >
            OSM SURGE TRACKER
          </div>
          <div
            style={{
              fontSize: "0.72rem",
              color: TEXT_MID,
              marginTop: "0.2rem",
              lineHeight: 1.4,
            }}
          >
            Tracking unusual OpenStreetMap editing surges — often an early signal of a
            disaster or major local event
          </div>
        </div>

        {/* right side: IST stamp + action buttons */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.6rem",
            flexWrap: "wrap",
            justifyContent: "flex-end",
          }}
        >
          <span style={{ fontSize: "0.75rem", color: TEXT_MID }}>
            LIVE&nbsp;·&nbsp;Updated {lastUpdated} IST
          </span>
          <NavButton onClick={onWhatIs} title="What this is" variant="strong">
            ⓘ What it is
          </NavButton>
          <NavButton onClick={onTutorial} title="How to use" variant="strong">
            ? How to use
          </NavButton>
          <NavButton onClick={onWhatsNew} title="What's new" variant="pill" accent={ACCENT_NEW}>
            ✨ What&apos;s new
          </NavButton>
          <NavButton
            onClick={onWhatsComing}
            title="What's coming"
            variant="pill"
            accent={ACCENT_COMING}
          >
            🚧 What&apos;s coming
          </NavButton>
          <NavButton onClick={onFeedback} title="Send feedback" variant="ghost">
            ✉ Feedback
          </NavButton>
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
        {tiles.map((t) => (
          <Tile key={t.label} value={t.value} label={t.label} tip={t.tip} />
        ))}
      </div>
    </div>
  );
}
