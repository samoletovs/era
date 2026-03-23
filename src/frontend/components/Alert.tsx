import React from "react";

interface AlertProps {
  type: "error" | "warning" | "success" | "info";
  message: string;
  onClose?: () => void;
}

const STYLES: Record<AlertProps["type"], { bg: string; border: string; color: string }> = {
  error: { bg: "var(--error-bg)", border: "#FEE2E2", color: "#D1242F" },
  warning: { bg: "var(--warning-bg)", border: "#FEF3C7", color: "#9A6700" },
  success: { bg: "var(--success-bg)", border: "#D1FAE5", color: "#065F46" },
  info: { bg: "var(--accent-bg)", border: "#DBEAFE", color: "var(--accent)" },
};

/** Styled alert box — replaces 6+ inline alert patterns across pages */
export function Alert({ type, message, onClose }: AlertProps) {
  const s = STYLES[type];
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "10px 14px", marginBottom: 16,
      background: s.bg, border: `1px solid ${s.border}`,
      borderRadius: "var(--radius-sm)", fontSize: "var(--text-sm)", color: s.color,
    }}>
      <span style={{ flex: 1 }}>{message}</span>
      {onClose && (
        <button
          onClick={onClose}
          aria-label="Dismiss"
          style={{ background: "none", border: "none", cursor: "pointer", color: s.color, fontSize: 14 }}
        >
          ✕
        </button>
      )}
    </div>
  );
}
