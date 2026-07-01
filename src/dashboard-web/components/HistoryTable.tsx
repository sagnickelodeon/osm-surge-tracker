"use client";

/**
 * Full-width, collapsible 7-day surge history table. Fixed column widths so the long
 * CONTEXT column wraps instead of forcing horizontal scroll.
 */

import { useState } from "react";

import { Surge } from "@/lib/api";
import { BORDER, CARD_BG_ALT, TEXT_DARK, TEXT_LIGHT, TEXT_MID } from "@/lib/config";
import { countryName } from "@/lib/countries";
import { fmtHistoryTime } from "@/lib/time";

const COLS: [string, string][] = [
  ["TIME", "9%"],
  ["COUNTRY", "11%"],
  ["REGION", "13%"],
  ["EDITS", "7%"],
  ["MAG", "7%"],
  ["TYPE", "9%"],
  ["CONTEXT", "44%"],
];

const td: React.CSSProperties = {
  padding: "0.4rem 0.5rem",
  verticalAlign: "top",
  borderTop: `1px solid ${BORDER}`,
  whiteSpace: "normal",
  wordBreak: "break-word",
};

export default function HistoryTable({ history }: { history: Surge[] }) {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          width: "100%",
          textAlign: "left",
          background: "transparent",
          border: `1px solid ${BORDER}`,
          borderRadius: 6,
          cursor: "pointer",
          padding: "0.6rem 0.75rem",
          fontSize: "0.72rem",
          letterSpacing: "0.08em",
          color: TEXT_LIGHT,
          textTransform: "uppercase",
        }}
      >
        {open ? "▾" : "▸"} Surge History · Last 7 Days
      </button>

      {open &&
        (history.length === 0 ? (
          <div style={{ color: TEXT_DARK, fontSize: "0.8rem", padding: "0.75rem 0.25rem" }}>
            No surge history available
          </div>
        ) : (
          <div style={{ maxHeight: 460, overflowY: "auto", marginTop: "0.5rem" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                tableLayout: "fixed",
                fontSize: "0.72rem",
              }}
            >
              <thead>
                <tr>
                  {COLS.map(([label, w]) => (
                    <th
                      key={label}
                      style={{
                        width: w,
                        textAlign: "left",
                        padding: "0.4rem 0.5rem",
                        position: "sticky",
                        top: 0,
                        background: CARD_BG_ALT,
                        color: TEXT_DARK,
                        fontWeight: 600,
                        letterSpacing: "0.05em",
                      }}
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {history.map((h) => {
                  const ctx = (h.explanation || "").trim() || "—";
                  const mag = h.surge_magnitude ?? 0;
                  return (
                    <tr key={h.surge_id}>
                      <td style={{ ...td, color: TEXT_MID }}>
                        {fmtHistoryTime(h.detected_at)}
                      </td>
                      <td style={{ ...td, color: TEXT_LIGHT }}>
                        {countryName(h.country_code)}
                      </td>
                      <td style={{ ...td, color: TEXT_LIGHT }}>{h.admin_region || ""}</td>
                      <td style={{ ...td, color: TEXT_MID }}>
                        {(h.edit_count ?? 0).toLocaleString("en-US")}
                      </td>
                      <td style={{ ...td, color: "#FFFFFF", fontWeight: 600 }}>
                        {mag.toFixed(1)}×
                      </td>
                      <td style={{ ...td, color: TEXT_MID }}>
                        {(h.dominant_tag || "").toUpperCase()}
                      </td>
                      <td style={{ ...td, color: TEXT_LIGHT }}>{ctx}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}
    </div>
  );
}
