import Modal from "./Modal";
import {
  BORDER,
  COLOR_CRITICAL,
  COLOR_ELEVATED,
  COLOR_HIGH,
  TEXT_LIGHT,
  TEXT_MID,
} from "@/lib/config";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: "1.75rem" }}>
      <div
        style={{
          fontSize: "0.7rem",
          fontWeight: 700,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: TEXT_MID,
          marginBottom: "0.6rem",
          paddingBottom: "0.4rem",
          borderBottom: `1px solid ${BORDER}`,
        }}
      >
        {title}
      </div>
      <div style={{ fontSize: "0.82rem", color: TEXT_LIGHT, lineHeight: 1.65 }}>
        {children}
      </div>
    </div>
  );
}

function Dot({ color }: { color: string }) {
  return (
    <span
      style={{
        display: "inline-block",
        width: 10,
        height: 10,
        borderRadius: "50%",
        background: color,
        marginRight: "0.4rem",
        verticalAlign: "middle",
        flexShrink: 0,
      }}
    />
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: "0.5rem",
        marginBottom: "0.5rem",
      }}
    >
      {children}
    </div>
  );
}

function Tag({ color, label }: { color: string; label: string }) {
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: "0.65rem",
        fontWeight: 700,
        letterSpacing: "0.08em",
        color,
        border: `1px solid ${color}`,
        borderRadius: 3,
        padding: "0.1rem 0.4rem",
        marginRight: "0.5rem",
      }}
    >
      {label}
    </span>
  );
}

export default function TutorialModal({
  open,
  onClose,
  heatmapWindowHours = 1,
}: {
  open: boolean;
  onClose: () => void;
  heatmapWindowHours?: number;
}) {
  const heatmapWindowLabel =
    heatmapWindowHours === 1 ? "hour" : `${heatmapWindowHours} hours`;
  return (
    <Modal open={open} onClose={onClose} title="How to Use OSM Surge Tracker" width={680}>
      <div style={{ padding: "1.5rem 1.5rem 2rem" }}>

        {/* overview */}
        <Section title="What is this?">
          <p style={{ margin: "0 0 0.6rem" }}>
            <strong style={{ color: "#FFFFFF" }}>OSM Surge Tracker</strong> is a
            real-time anomaly-detection system that watches{" "}
            <strong style={{ color: "#FFFFFF" }}>OpenStreetMap</strong> edits worldwide
            and flags regions experiencing an unusual spike in mapping activity.
          </p>
          <p style={{ margin: 0 }}>
            When a disaster, humanitarian response, or major local event occurs —
            floods in Karnataka, an earthquake in Türkiye — volunteers flood
            OpenStreetMap with new buildings, roads, and hospitals within hours. This
            system detects that surge automatically and surfaces it here with an
            AI-generated explanation and related news.
          </p>
        </Section>

        {/* map */}
        <Section title="Reading the Map">
          <Row>
            <span style={{ marginTop: 2, flexShrink: 0 }}>🌡️</span>
            <div>
              <strong style={{ color: "#FFFFFF" }}>Heatmap glow</strong> — background
              colour shows the density of OSM edits across all regions in the last{" "}
              {heatmapWindowLabel}. Brighter = more editing activity.
            </div>
          </Row>
          <Row>
            <span style={{ marginTop: 2, flexShrink: 0 }}>🔴</span>
            <div>
              <strong style={{ color: "#FFFFFF" }}>Coloured dots</strong> — each dot is
              a confirmed surge. Hover over a dot to see the region name and surge
              magnitude. Dot colour matches the severity (see below).
            </div>
          </Row>
          <div
            style={{
              marginTop: "0.75rem",
              padding: "0.6rem 0.75rem",
              background: "#0e1117",
              borderRadius: 4,
              border: `1px solid ${BORDER}`,
              fontSize: "0.75rem",
              color: TEXT_MID,
            }}
          >
            Drag to pan · Scroll to zoom · Hover a dot for details
          </div>
        </Section>

        {/* severity */}
        <Section title="Surge Severity">
          <div style={{ display: "flex", flexDirection: "column", gap: "0.65rem" }}>
            <Row>
              <Dot color={COLOR_CRITICAL} />
              <div>
                <Tag color={COLOR_CRITICAL} label="CRITICAL" />
                <span>≥ 25× normal edit volume — possible major disaster response or mass mapping event.</span>
              </div>
            </Row>
            <Row>
              <Dot color={COLOR_HIGH} />
              <div>
                <Tag color={COLOR_HIGH} label="HIGH" />
                <span>15–25× normal — significant regional surge, worth investigating.</span>
              </div>
            </Row>
            <Row>
              <Dot color={COLOR_ELEVATED} />
              <div>
                <Tag color={COLOR_ELEVATED} label="ELEVATED" />
                <span>
                  10–15× normal — the smallest confirmed surges (the detector&apos;s
                  magnitude floor is 10×, so nothing milder is flagged).
                </span>
              </div>
            </Row>
          </div>
        </Section>

        {/* surge feed */}
        <Section title="The Surge Feed (right panel)">
          <Row>
            <span style={{ flexShrink: 0 }}>📍</span>
            <span>Shows all active surges detected in the last 2 hours, sorted by magnitude.</span>
          </Row>
          <Row>
            <span style={{ flexShrink: 0 }}>🤖</span>
            <span>
              Each card has a{" "}
              <strong style={{ color: "#FFFFFF" }}>"Why this surge?"</strong> button.
              Click it to expand an AI-generated explanation (powered by GPT-4o mini)
              that correlates the surge with recent news headlines.
            </span>
          </Row>
          <Row>
            <span style={{ flexShrink: 0 }}>📊</span>
            <span>
              The card also shows the dominant OSM tag type (e.g. BUILDING, HIGHWAY)
              and the z-score — how many standard deviations above the region&apos;s
              historical baseline this surge is.{" "}
              <strong style={{ color: "#FFFFFF" }}>N/A</strong> means the system is
              still warming up its baseline for that region (first 7 days of data).
            </span>
          </Row>
        </Section>

        {/* history */}
        <Section title="Surge History">
          <p style={{ margin: "0 0 0.5rem" }}>
            Click <strong style={{ color: "#FFFFFF" }}>Surge History · Last 7 Days</strong>{" "}
            at the bottom of the page to expand the full history table. Columns show the
            detection time (IST), country, region, edit count, magnitude, dominant tag
            type, and the AI explanation.
          </p>
        </Section>

        {/* detection */}
        <Section title="How Detection Works">
          <p style={{ margin: "0 0 0.75rem" }}>
            The processor aggregates OSM edits into 5-minute windows per region. A
            region is flagged as a surge only when{" "}
            <strong style={{ color: "#FFFFFF" }}>all four</strong> conditions hold
            simultaneously (to suppress false positives):
          </p>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "0.5rem",
              padding: "0.75rem 1rem",
              background: "#0e1117",
              borderRadius: 4,
              border: `1px solid ${BORDER}`,
            }}
          >
            {[
              ["Unique mappers ≥ 3", "Multiple independent editors — excludes single-account bulk imports"],
              ["z-score > 4.0", "Statistically unusual vs. the region's rolling 7-day, hour-of-day baseline"],
              ["Magnitude > 10×", "At least 10× the region's normal edit volume for that hour"],
              ["Edit count > 1000", "Enough absolute activity to matter"],
            ].map(([stat, desc]) => (
              <div key={stat} style={{ display: "flex", gap: "0.75rem" }}>
                <span
                  style={{
                    fontFamily: "monospace",
                    fontSize: "0.75rem",
                    color: COLOR_ELEVATED,
                    flexShrink: 0,
                    paddingTop: 1,
                  }}
                >
                  {stat}
                </span>
                <span style={{ color: TEXT_MID, fontSize: "0.78rem" }}>{desc}</span>
              </div>
            ))}
          </div>
          <p style={{ margin: "0.75rem 0 0", color: TEXT_MID, fontSize: "0.78rem" }}>
            Before a region has a baseline, the system falls back to flagging regions that
            exceed 2× the global 95th-percentile edit count (while still meeting the
            magnitude, edit-count, and unique-mapper floors above).
          </p>
        </Section>

        {/* refresh */}
        <Section title="Data Freshness">
          <Row>
            <span style={{ flexShrink: 0 }}>🔄</span>
            <span>
              The dashboard polls the API every{" "}
              <strong style={{ color: "#FFFFFF" }}>60 seconds</strong> and updates in
              place — no page reload. OSM edits flow in roughly every 60 s (minutely
              diffs), so the data you see is at most ~2 minutes old. All times shown are{" "}
              <strong style={{ color: "#FFFFFF" }}>IST (UTC+5:30)</strong>.
            </span>
          </Row>
        </Section>

      </div>
    </Modal>
  );
}
