"use client";

/**
 * First-visit orientation card. Deliberately short — it answers "what am I looking at?",
 * not "how do I use this". The full How-to lives in TutorialModal, one click away.
 *
 * Shown once per browser (localStorage-gated in app/page.tsx); the "?" button in the
 * header still opens the full tutorial at any time.
 */

import Modal from "./Modal";
import { BORDER, TEXT_LIGHT, TEXT_MID } from "@/lib/config";

const POINTS: { icon: string; term: string; body: string }[] = [
  {
    icon: "🗺️",
    term: "OpenStreetMap",
    body: "A free map of the world that anyone can edit — Wikipedia, but for maps. Thousands of volunteers change it every minute.",
  },
  {
    icon: "📈",
    term: "A “surge”",
    body: "When one region suddenly gets far more edits than it normally would. That usually means something happened there — a flood, an earthquake, or a coordinated mapping drive.",
  },
  {
    icon: "🔴",
    term: "This screen",
    body: "The map shows where edits are happening (the glow) and which regions are surging (the coloured dots). The right panel lists live surges, each with an AI explanation of the likely cause.",
  },
];

export default function WelcomeModal({
  open,
  onClose,
  onTutorial,
}: {
  open: boolean;
  onClose: () => void;
  onTutorial: () => void;
}) {
  return (
    <Modal open={open} onClose={onClose} title="What am I looking at?" width={560}>
      <div style={{ padding: "1.25rem 1.5rem 1.4rem" }}>
        <p
          style={{
            margin: "0 0 1.1rem",
            fontSize: "0.85rem",
            lineHeight: 1.6,
            color: TEXT_LIGHT,
          }}
        >
          This dashboard watches the world&apos;s map being redrawn in real time, and flags
          the places where people are suddenly drawing much faster than usual.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: "0.9rem" }}>
          {POINTS.map((p) => (
            <div key={p.term} style={{ display: "flex", gap: "0.65rem", alignItems: "flex-start" }}>
              <span style={{ fontSize: "1rem", lineHeight: 1.4, flexShrink: 0 }}>{p.icon}</span>
              <div style={{ fontSize: "0.82rem", lineHeight: 1.6, color: TEXT_LIGHT }}>
                <strong style={{ color: "#FFFFFF" }}>{p.term}</strong> — {p.body}
              </div>
            </div>
          ))}
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            alignItems: "center",
            gap: "0.75rem",
            marginTop: "1.5rem",
            paddingTop: "1rem",
            borderTop: `1px solid ${BORDER}`,
          }}
        >
          <button
            onClick={onTutorial}
            style={{
              background: "transparent",
              border: "none",
              color: TEXT_MID,
              cursor: "pointer",
              fontSize: "0.78rem",
              padding: "0.45rem 0.2rem",
            }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "#CCCCCC")}
            onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.color = TEXT_MID)}
          >
            Show me how to use it →
          </button>
          <button
            onClick={onClose}
            style={{
              background: "#FFFFFF",
              border: "none",
              borderRadius: 4,
              color: "#0E1117",
              cursor: "pointer",
              fontSize: "0.78rem",
              fontWeight: 600,
              padding: "0.45rem 1.1rem",
            }}
          >
            Got it
          </button>
        </div>
      </div>
    </Modal>
  );
}
