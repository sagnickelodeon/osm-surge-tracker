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
  const [email, setEmail] = useState("");
  const [type, setType] = useState<FeedbackType>("Feature Request");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  function handleClose() {
    // Reset the form once it's been submitted so reopening starts clean.
    if (submitted) {
      setName("");
      setEmail("");
      setType("Feature Request");
      setMessage("");
      setSubmitted(false);
      setError("");
    }
    onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim()) {
      setError("Please enter a message before submitting.");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      const r = await fetch("/api/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          type,
          feedback: message.trim(),
        }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setSubmitted(true);
    } catch {
      setError("Couldn't send your feedback — please try again in a moment.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title="Feedback & Suggestions" width={500}>
      <div style={{ padding: "1.5rem" }}>
        {submitted ? (
          // Success state
          <div style={{ textAlign: "center", padding: "2rem 1rem" }}>
            <div style={{ fontSize: "2.5rem", marginBottom: "1rem" }}>✅</div>
            <div
              style={{ color: COLOR_ELEVATED, fontWeight: 700, marginBottom: "0.5rem" }}
            >
              Thanks for your feedback!
            </div>
            <div style={{ color: TEXT_LIGHT, fontSize: "0.82rem", marginBottom: "1.5rem" }}>
              Your message has been received. I read every submission and use it to
              improve the tracker.
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
              the form below and hit send — it's that simple.
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

            {/* Email */}
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
                Email <span style={{ color: TEXT_DARK }}>(optional — only if you&apos;d like a reply)</span>
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
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

            {/* Footer row — Cancel on the left, Send on the right for symmetry */}
            <div style={{ display: "flex", justifyContent: "space-between", gap: "0.6rem" }}>
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
                disabled={submitting}
                style={{
                  background: CARD_BG_ALT,
                  border: `1px solid ${COLOR_ELEVATED}`,
                  borderRadius: 4,
                  color: COLOR_ELEVATED,
                  cursor: submitting ? "default" : "pointer",
                  fontSize: "0.8rem",
                  fontWeight: 600,
                  padding: "0.5rem 1.25rem",
                  opacity: submitting ? 0.6 : 1,
                }}
              >
                {submitting ? "Sending…" : "Send Feedback"}
              </button>
            </div>
          </form>
        )}
      </div>
    </Modal>
  );
}
