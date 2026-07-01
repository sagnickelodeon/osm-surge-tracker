"use client";

import { useCallback, useEffect } from "react";

import { BORDER, CARD_BG } from "@/lib/config";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  width?: number;
  children: React.ReactNode;
}

export default function Modal({ open, onClose, title, width = 600, children }: ModalProps) {
  const handleKey = useCallback(
    (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); },
    [onClose],
  );

  useEffect(() => {
    if (!open) return;
    document.addEventListener("keydown", handleKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = "";
    };
  }, [open, handleKey]);

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.78)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: CARD_BG,
          border: `1px solid ${BORDER}`,
          borderRadius: 8,
          width: "100%",
          maxWidth: width,
          maxHeight: "88vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          boxShadow: "0 24px 64px rgba(0,0,0,0.6)",
        }}
      >
        {/* header bar */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "1rem 1.25rem",
            borderBottom: `1px solid ${BORDER}`,
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontWeight: 700,
              fontSize: "0.9rem",
              color: "#FFFFFF",
              letterSpacing: "0.06em",
              textTransform: "uppercase",
            }}
          >
            {title}
          </span>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background: "transparent",
              border: "none",
              color: "#888888",
              cursor: "pointer",
              fontSize: "1.4rem",
              lineHeight: 1,
              padding: "0 0.2rem",
              transition: "color 0.15s",
            }}
            onMouseEnter={(e) => ((e.target as HTMLButtonElement).style.color = "#FFFFFF")}
            onMouseLeave={(e) => ((e.target as HTMLButtonElement).style.color = "#888888")}
          >
            ×
          </button>
        </div>

        {/* scrollable body */}
        <div style={{ overflowY: "auto", flex: 1 }}>{children}</div>
      </div>
    </div>
  );
}
