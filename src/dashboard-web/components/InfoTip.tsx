"use client";

/**
 * A small "i" affordance that reveals a plain-language definition of a jargon term.
 *
 * The popover is `position: fixed`, anchored off the button's bounding rect, so it is
 * never clipped by a scrolling ancestor (the surge feed scrolls on its own). It opens on
 * hover/focus for pointer + keyboard users and on click/tap for touch, and closes on
 * outside click, Escape, scroll, or resize.
 */

import { useCallback, useEffect, useId, useRef, useState } from "react";

import { BORDER, CARD_BG_ALT, TEXT_LIGHT, TEXT_MID } from "@/lib/config";

const WIDTH = 220;

export default function InfoTip({ term, children }: { term: string; children: string }) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const id = useId();
  const open = pos !== null;

  const show = useCallback(() => {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const half = WIDTH / 2;
    // Clamp horizontally so the popover never runs off either viewport edge.
    const left = Math.min(Math.max(r.left + r.width / 2, half + 8), window.innerWidth - half - 8);
    setPos({ top: r.bottom + 8, left });
  }, []);

  const hide = useCallback(() => setPos(null), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") hide();
    };
    const onDown = (e: Event) => {
      if (btnRef.current && !btnRef.current.contains(e.target as Node)) hide();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    // `true` = capture, so scrolling any ancestor (e.g. the surge feed) dismisses it.
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
    };
  }, [open, hide]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-label={`What does ${term} mean?`}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onClick={(e) => {
          e.stopPropagation();
          if (open) hide();
          else show();
        }}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 13,
          height: 13,
          marginLeft: "0.3rem",
          padding: 0,
          borderRadius: "50%",
          border: `1px solid ${TEXT_MID}`,
          background: "transparent",
          color: TEXT_MID,
          fontSize: "0.55rem",
          fontWeight: 700,
          lineHeight: 1,
          textTransform: "none",
          letterSpacing: "normal",
          cursor: "help",
          verticalAlign: "middle",
          flexShrink: 0,
        }}
      >
        i
      </button>

      {open && pos && (
        <span
          id={id}
          role="tooltip"
          style={{
            position: "fixed",
            top: pos.top,
            left: pos.left,
            transform: "translateX(-50%)",
            width: WIDTH,
            zIndex: 1200,
            background: CARD_BG_ALT,
            border: `1px solid ${BORDER}`,
            borderRadius: 4,
            padding: "0.5rem 0.6rem",
            fontSize: "0.72rem",
            fontWeight: 400,
            lineHeight: 1.5,
            color: TEXT_LIGHT,
            // Reset inherited label styling (tile labels are uppercase + tracked out).
            textTransform: "none",
            letterSpacing: "normal",
            textAlign: "left",
            boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
            pointerEvents: "none",
          }}
        >
          {children}
        </span>
      )}
    </>
  );
}
