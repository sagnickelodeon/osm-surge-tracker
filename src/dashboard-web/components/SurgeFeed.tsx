/** Right-hand panel: the live surge feed. */

import { Surge } from "@/lib/api";
import { BORDER, COLOR_CRITICAL, MAP_HEIGHT, TEXT_DARK, TEXT_MID } from "@/lib/config";
import SurgeCard from "./SurgeCard";

export default function SurgeFeed({ surges }: { surges: Surge[] }) {
  return (
    // Match the map height and keep the header pinned while the list scrolls
    // on its own — otherwise a long surge list pushes the 7-day history far
    // down the page.
    <div style={{ height: MAP_HEIGHT, display: "flex", flexDirection: "column" }}>
      <div
        style={{
          fontSize: "0.7rem",
          color: TEXT_DARK,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          marginBottom: "0.75rem",
          borderBottom: `1px solid ${BORDER}`,
          paddingBottom: "0.5rem",
          flexShrink: 0,
        }}
      >
        ● Active Surges&nbsp;&nbsp;
        <span style={{ color: COLOR_CRITICAL }}>{surges.length}</span>
      </div>

      {surges.length === 0 ? (
        // A quiet feed is the common first-load state, so use it to teach rather than
        // just report emptiness.
        <div
          style={{
            textAlign: "center",
            color: TEXT_DARK,
            fontSize: "0.8rem",
            padding: "2rem 0.75rem",
            lineHeight: 1.6,
          }}
        >
          <div style={{ fontSize: "1.4rem", marginBottom: "0.5rem" }}>🌍</div>
          <div style={{ color: TEXT_MID, marginBottom: "0.35rem" }}>
            No active surges right now
          </div>
          <div style={{ fontSize: "0.72rem" }}>
            When volunteers suddenly flood a region with map edits — after a flood,
            an earthquake, or a coordinated mapathon — it will appear here.
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, overflowY: "auto", paddingRight: "0.25rem" }}>
          {surges.map((s) => (
            <SurgeCard key={s.surge_id} surge={s} />
          ))}
        </div>
      )}
    </div>
  );
}
