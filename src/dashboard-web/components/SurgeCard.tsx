"use client";

/**
 * One surge in the live feed: severity-coloured left border, magnitude front and centre,
 * one-line context, and a click-to-expand "Why this surge?" explanation.
 */

import { useState } from "react";

import { Surge } from "@/lib/api";
import { BORDER, CARD_BG, severity, TEXT_DARK, TEXT_MID } from "@/lib/config";
import { minsAgo } from "@/lib/time";
import { countryName } from "@/lib/countries";

export default function SurgeCard({ surge }: { surge: Surge }) {
  const [open, setOpen] = useState(false);

  const magnitude = surge.surge_magnitude ?? 0;
  const { color, label } = severity(magnitude);

  const region = surge.admin_region || "Unknown";
  const ccName = countryName(surge.country_code);
  const location = ccName ? `${region}, ${ccName}` : region;
  const editCount = (surge.edit_count ?? 0).toLocaleString("en-US");
  const tag = (surge.dominant_tag || "").toUpperCase();
  const z = surge.z_score ?? 0;
  // z_score = -1.0 is the cold-start sentinel (no baseline yet) — show "N/A".
  const zDisplay = z < 0 ? "N/A" : `z=${z.toFixed(1)}`;
  const timeDisplay = minsAgo(surge.detected_at);
  const explanation = (surge.explanation || "").trim();

  return (
    <div style={{ marginBottom: "0.6rem" }}>
      <div
        style={{
          border: `1px solid ${BORDER}`,
          borderLeft: `3px solid ${color}`,
          background: CARD_BG,
          borderRadius: explanation ? "4px 4px 0 0" : 4,
          borderBottom: explanation ? "none" : undefined,
          padding: "0.75rem 0.75rem 0.5rem",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "0.3rem",
          }}
        >
          <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "#FFFFFF" }}>
            {location}
          </span>
          <span style={{ fontSize: "0.65rem", color, letterSpacing: "0.08em" }}>{label}</span>
        </div>
        <div style={{ fontSize: "1.1rem", fontWeight: 700, color, marginBottom: "0.2rem" }}>
          {magnitude.toFixed(1)}×
          <span style={{ fontSize: "0.75rem", fontWeight: 400, color: TEXT_MID }}>
            {" "}
            normal · {editCount} edits
          </span>
        </div>
        <div style={{ fontSize: "0.7rem", color: TEXT_DARK }}>
          {timeDisplay} · {tag} · {zDisplay}
        </div>
      </div>

      {explanation ? (
        <div
          style={{
            border: `1px solid ${BORDER}`,
            borderLeft: `3px solid ${color}`,
            borderTop: "none",
            background: CARD_BG,
            borderRadius: "0 0 4px 4px",
          }}
        >
          <button
            onClick={() => setOpen((o) => !o)}
            style={{
              width: "100%",
              textAlign: "left",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              padding: "0.4rem 0.75rem",
              fontSize: "0.72rem",
              color: TEXT_MID,
            }}
          >
            {open ? "▾" : "▸"} Why this surge?
          </button>
          {open && (
            <div
              style={{
                padding: "0 0.75rem 0.6rem",
                fontSize: "0.78rem",
                color: "#CCCCCC",
                lineHeight: 1.5,
              }}
            >
              {explanation}
            </div>
          )}
        </div>
      ) : (
        <div style={{ fontSize: "0.68rem", color: TEXT_DARK, padding: "0.25rem 0.1rem" }}>
          No explanation yet
        </div>
      )}
    </div>
  );
}
