/** Footer strip: contact info + links to the tutorial and feedback modals. */

import { BORDER, TEXT_DARK, TEXT_MID } from "@/lib/config";

// Contact links. GITHUB/LINKEDIN render only when non-empty.
const AUTHOR = "Sagnik Dasgupta";
const EMAIL = "sagnikdasgupta.dataengineer@gmail.com";
const GITHUB = "https://github.com/sagnickelodeon";
const LINKEDIN = "https://www.linkedin.com/in/sagnickelodeon/";

interface FooterProps {
  onTutorial: () => void;
  onFeedback: () => void;
}

const linkStyle: React.CSSProperties = {
  color: TEXT_MID,
  textDecoration: "none",
  fontSize: "0.72rem",
  transition: "color 0.15s",
};

export default function Footer({ onTutorial, onFeedback }: FooterProps) {
  return (
    <footer
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 100,
        background: "#0e1117",
        borderTop: `1px solid ${BORDER}`,
        padding: "0.5rem 1.25rem",
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "space-between",
        alignItems: "center",
        gap: "0.5rem",
      }}
    >
      {/* left — author + contact */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: "0.6rem",
          fontSize: "0.72rem",
          color: TEXT_DARK,
        }}
      >
        <span>
          Built by{" "}
          <strong style={{ color: TEXT_MID, fontWeight: 600 }}>{AUTHOR}</strong>
        </span>
        <span style={{ color: BORDER }}>·</span>
        <a
          href={`mailto:${EMAIL}`}
          style={linkStyle}
          onMouseEnter={(e) => ((e.target as HTMLAnchorElement).style.color = "#CCCCCC")}
          onMouseLeave={(e) => ((e.target as HTMLAnchorElement).style.color = TEXT_MID)}
        >
          {EMAIL}
        </a>
        {GITHUB && (
          <>
            <span style={{ color: BORDER }}>·</span>
            <a
              href={GITHUB}
              target="_blank"
              rel="noreferrer"
              style={linkStyle}
              onMouseEnter={(e) =>
                ((e.target as HTMLAnchorElement).style.color = "#CCCCCC")
              }
              onMouseLeave={(e) =>
                ((e.target as HTMLAnchorElement).style.color = TEXT_MID)
              }
            >
              GitHub ↗
            </a>
          </>
        )}
        {LINKEDIN && (
          <>
            <span style={{ color: BORDER }}>·</span>
            <a
              href={LINKEDIN}
              target="_blank"
              rel="noreferrer"
              style={linkStyle}
              onMouseEnter={(e) =>
                ((e.target as HTMLAnchorElement).style.color = "#CCCCCC")
              }
              onMouseLeave={(e) =>
                ((e.target as HTMLAnchorElement).style.color = TEXT_MID)
              }
            >
              LinkedIn ↗
            </a>
          </>
        )}
      </div>

      {/* right — modal links */}
      <div style={{ display: "flex", gap: "1rem" }}>
        {[
          { label: "? Tutorial", onClick: onTutorial },
          { label: "✉ Feedback", onClick: onFeedback },
        ].map(({ label, onClick }) => (
          <button
            key={label}
            onClick={onClick}
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              color: TEXT_DARK,
              fontSize: "0.72rem",
              letterSpacing: "0.05em",
              padding: 0,
              transition: "color 0.15s",
            }}
            onMouseEnter={(e) =>
              ((e.target as HTMLButtonElement).style.color = TEXT_MID)
            }
            onMouseLeave={(e) =>
              ((e.target as HTMLButtonElement).style.color = TEXT_DARK)
            }
          >
            {label}
          </button>
        ))}
      </div>
    </footer>
  );
}
