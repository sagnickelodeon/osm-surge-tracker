"use client";

/**
 * Always-on legend overlaid on the map, decoding its two visual encodings: the heatmap
 * glow (edit density) and the severity-coloured surge dots. Without this a first-time
 * visitor has no way to know what the colours mean without opening the tutorial.
 *
 * Collapsible, so it can be folded away on small screens.
 */

import { useState } from "react";

import {
  BORDER,
  COLOR_CRITICAL,
  COLOR_ELEVATED,
  COLOR_HIGH,
  TEXT_DARK,
  TEXT_LIGHT,
  TEXT_MID,
} from "@/lib/config";

// Mirrors severity() in lib/config.ts.
const TIERS: { color: string; label: string }[] = [
  { color: COLOR_CRITICAL, label: "≥ 15× normal — Critical" },
  { color: COLOR_HIGH, label: "8–15× normal — High" },
  { color: COLOR_ELEVATED, label: "< 8× normal — Elevated" },
];

// Approximates deck.gl's default HeatmapLayer colour ramp (low → high).
const HEAT_GRADIENT =
  "linear-gradient(90deg, rgb(255,255,178), rgb(254,217,118), rgb(254,178,76), rgb(253,141,60), rgb(240,59,32), rgb(189,0,38))";

export default function MapLegend() {
  const [open, setOpen] = useState(true);

  return (
    <div
      style={{
        position: "absolute",
        left: 12,
        bottom: 12,
        zIndex: 2,
        pointerEvents: "auto",
        background: "rgba(19, 22, 28, 0.92)",
        border: `1px solid ${BORDER}`,
        borderRadius: 6,
        padding: open ? "0.55rem 0.7rem 0.65rem" : "0.35rem 0.6rem",
        maxWidth: 230,
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={{
          background: "transparent",
          border: "none",
          padding: 0,
          cursor: "pointer",
          color: TEXT_MID,
          fontSize: "0.66rem",
          fontWeight: 700,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
        }}
      >
        {open ? "▾" : "▸"} Legend
      </button>

      {open && (
        <div style={{ marginTop: "0.55rem" }}>
          {/* heatmap glow */}
          <div style={{ fontSize: "0.68rem", color: TEXT_LIGHT, marginBottom: "0.3rem" }}>
            Glow — edit density
          </div>
          <div
            style={{
              height: 7,
              borderRadius: 3,
              background: HEAT_GRADIENT,
              marginBottom: "0.2rem",
            }}
          />
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: "0.6rem",
              color: TEXT_DARK,
              marginBottom: "0.7rem",
            }}
          >
            <span>fewer edits</span>
            <span>more edits</span>
          </div>

          {/* severity dots */}
          <div style={{ fontSize: "0.68rem", color: TEXT_LIGHT, marginBottom: "0.35rem" }}>
            Dots — confirmed surges
          </div>
          {TIERS.map((t) => (
            <div
              key={t.label}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.4rem",
                marginBottom: "0.22rem",
              }}
            >
              <span
                style={{
                  width: 9,
                  height: 9,
                  borderRadius: "50%",
                  background: t.color,
                  flexShrink: 0,
                }}
              />
              <span style={{ fontSize: "0.65rem", color: TEXT_MID }}>{t.label}</span>
            </div>
          ))}

          <div
            style={{
              marginTop: "0.5rem",
              paddingTop: "0.4rem",
              borderTop: `1px solid ${BORDER}`,
              fontSize: "0.6rem",
              color: TEXT_DARK,
            }}
          >
            Hover a dot for region details
          </div>
        </div>
      )}
    </div>
  );
}
