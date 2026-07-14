"use client";

/**
 * Presentational modal for the "What's new" / "What's coming" lists. The content
 * arrives as props (each string is one bullet) — it rides along on the /stats poll
 * (see api/updates.py), so there is no fetch or loading state here.
 */

import Modal from "./Modal";
import { TEXT_LIGHT, TEXT_MID } from "@/lib/config";

export default function ChangelogModal({
  open,
  onClose,
  title,
  items,
  accent,
  emptyText,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  items: string[];
  accent: string;
  emptyText: string;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title} width={560}>
      <div style={{ padding: "1.25rem 1.5rem 1.5rem" }}>
        {items.length === 0 ? (
          <p style={{ margin: 0, fontSize: "0.85rem", color: TEXT_MID, lineHeight: 1.6 }}>
            {emptyText}
          </p>
        ) : (
          <ul
            style={{
              margin: 0,
              padding: 0,
              listStyle: "none",
              display: "flex",
              flexDirection: "column",
              gap: "0.7rem",
            }}
          >
            {items.map((item, i) => (
              <li
                key={i}
                style={{
                  display: "flex",
                  gap: "0.6rem",
                  alignItems: "flex-start",
                  fontSize: "0.85rem",
                  lineHeight: 1.6,
                  color: TEXT_LIGHT,
                }}
              >
                <span style={{ color: accent, flexShrink: 0, marginTop: "0.05rem" }}>▹</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}
