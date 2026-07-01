"use client";

import { useState } from "react";

import Modal from "./Modal";
import {
  BORDER,
  CARD_BG_ALT,
  COLOR_ELEVATED,
  TEXT_DARK,
  TEXT_LIGHT,
  TEXT_MID,
} from "@/lib/config";

const CONTACT_EMAIL = "sagnikdasgupta.dataengineer@gmail.com";

const TYPES = [
  "Feature Request",
  "Bug Report",
  "Data / Detection Issue",
  "General Feedback",
  "Other",
] as const;
type FeedbackType = (typeof TYPES)[number];

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "#0e1117",
  border: `1px solid ${BORDER}`,
  borderRadius: 4,
  color: "#e6e6e6",
  fontSize: "0.82rem",
  padding: "0.55rem 0.75rem",
  outline: "none",
  boxSizing: "border-box",
};

export default function FeedbackModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState<FeedbackType>("Feature Request");
  const [message, setMessage] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  function handleClose() {
    // Reset after close animation would finish; just reset immediately.
    if (submitted) {
      setName("");
      setType("Feature Request");
      setMessage("");
      setSubmitted(false);
      setError("");
    }
    onClose();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim()) {
      setError("Please enter a message before submitting.");
      return;
    }
    setError("");

    const subject = encodeURIComponent(
      `[OSM Surge Tracker] ${type}${name.trim() ? ` — ${name.trim()}` : ""}`,
    );
    const body = encodeURIComponent(
      [
        `From: ${name.trim() || "Anonymous"}`,
        `Type: ${type}`,
        "",
        message.trim(),
      ].join("\n"),
    );

    window.open(`mailto:${CONTACT_EMAIL}?subject=${subject}&body=${body}`, "_blank");
    setSubmitted(true);
  }

  return (
    <Modal open={open} onClose={handleClose} title="Feedback & Suggestions" width={500}>
      <div style={{ padding: "1.5rem" }}>
        {submitted ? (
          // Success state
          <div style={{ textAlign: "center", padding: "2rem 1rem" }}>
            <div style={{ fontSize: "2.5rem", marginBottom: "1rem" }}>📬</div>
            <div
              style={{ color: COLOR_ELEVATED, fontWeight: 700, marginBottom: "0.5rem" }}
            >
              Email client opened!
            </div>
            <div style={{ color: TEXT_LIGHT, fontSize: "0.82rem", marginBottom: "1.5rem" }}>
              Your feedback was pre-filled into a new email to{" "}
              <span style={{ color: "#FFFFFF" }}>{CONTACT_EMAIL}</span>. Just hit send
              whenever you&apos;re ready.
            </div>
            <div
              style={{ color: TEXT_MID, fontSize: "0.75rem", marginBottom: "1.5rem" }}
            >
              Didn&apos;t open? Copy this address and paste it into your email client:
              <br />
              <span
                style={{
                  color: COLOR_ELEVATED,
                  fontFamily: "monospace",
                  userSelect: "all",
                }}
              >
                {CONTACT_EMAIL}
              </span>
            </div>
            <button
              onClick={handleClose}
              style={{
                background: "transparent",
                border: `1px solid ${BORDER}`,
                borderRadius: 4,
                color: TEXT_LIGHT,
                cursor: "pointer",
                fontSize: "0.8rem",
                padding: "0.5rem 1.25rem",
              }}
            >
              Close
            </button>
          </div>
        ) : (
          // Form
          <form onSubmit={handleSubmit}>
            <div
              style={{
                fontSize: "0.8rem",
                color: TEXT_MID,
                marginBottom: "1.25rem",
                lineHeight: 1.55,
              }}
            >
              Got a suggestion, found a bug, or want to share an observation? Fill in
              the form below — it opens a pre-filled email for you to send.
            </div>

            {/* Name */}
            <div style={{ marginBottom: "1rem" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "0.7rem",
                  color: TEXT_MID,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  marginBottom: "0.35rem",
                }}
              >
                Name <span style={{ color: TEXT_DARK }}>(optional)</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                style={inputStyle}
                onFocus={(e) => (e.currentTarget.style.borderColor = "#4a4d55")}
                onBlur={(e) => (e.currentTarget.style.borderColor = BORDER)}
              />
            </div>

            {/* Type */}
            <div style={{ marginBottom: "1rem" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "0.7rem",
                  color: TEXT_MID,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  marginBottom: "0.35rem",
                }}
              >
                Feedback type
              </label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as FeedbackType)}
                style={{ ...inputStyle, cursor: "pointer" }}
                onFocus={(e) => (e.currentTarget.style.borderColor = "#4a4d55")}
                onBlur={(e) => (e.currentTarget.style.borderColor = BORDER)}
              >
                {TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            {/* Message */}
            <div style={{ marginBottom: "1.25rem" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "0.7rem",
                  color: TEXT_MID,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  marginBottom: "0.35rem",
                }}
              >
                Message <span style={{ color: "#FF4B4B" }}>*</span>
              </label>
              <textarea
                value={message}
                onChange={(e) => {
                  setMessage(e.target.value);
                  if (error) setError("");
                }}
                placeholder="Describe your feedback or suggestion in as much detail as you like…"
                rows={6}
                style={{ ...inputStyle, resize: "vertical", minHeight: 120 }}
                onFocus={(e) => (e.currentTarget.style.borderColor = "#4a4d55")}
                onBlur={(e) => (e.currentTarget.style.borderColor = BORDER)}
              />
              {error && (
                <div style={{ color: "#FF4B4B", fontSize: "0.72rem", marginTop: "0.3rem" }}>
                  {error}
                </div>
              )}
            </div>

            {/* Footer row */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span style={{ fontSize: "0.72rem", color: TEXT_DARK }}>
                Sends to{" "}
                <span style={{ color: TEXT_MID, fontFamily: "monospace" }}>
                  {CONTACT_EMAIL}
                </span>
              </span>
              <div style={{ display: "flex", gap: "0.6rem" }}>
                <button
                  type="button"
                  onClick={handleClose}
                  style={{
                    background: "transparent",
                    border: `1px solid ${BORDER}`,
                    borderRadius: 4,
                    color: TEXT_MID,
                    cursor: "pointer",
                    fontSize: "0.8rem",
                    padding: "0.5rem 1rem",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{
                    background: CARD_BG_ALT,
                    border: `1px solid ${COLOR_ELEVATED}`,
                    borderRadius: 4,
                    color: COLOR_ELEVATED,
                    cursor: "pointer",
                    fontSize: "0.8rem",
                    fontWeight: 600,
                    padding: "0.5rem 1.25rem",
                  }}
                >
                  Open Email ↗
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </Modal>
  );
}
