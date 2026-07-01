/** Right-hand panel: the live surge feed. */

import { Surge } from "@/lib/api";
import { BORDER, COLOR_CRITICAL, TEXT_DARK } from "@/lib/config";
import SurgeCard from "./SurgeCard";

export default function SurgeFeed({ surges }: { surges: Surge[] }) {
  return (
    <div>
      <div
        style={{
          fontSize: "0.7rem",
          color: TEXT_DARK,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          marginBottom: "0.75rem",
          borderBottom: `1px solid ${BORDER}`,
          paddingBottom: "0.5rem",
        }}
      >
        ● Active Surges&nbsp;&nbsp;
        <span style={{ color: COLOR_CRITICAL }}>{surges.length}</span>
      </div>

      {surges.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            color: TEXT_DARK,
            fontSize: "0.8rem",
            padding: "2rem 0",
          }}
        >
          No active surges detected
        </div>
      ) : (
        surges.map((s) => <SurgeCard key={s.surge_id} surge={s} />)
      )}
    </div>
  );
}
