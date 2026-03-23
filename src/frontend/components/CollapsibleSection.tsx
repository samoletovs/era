import React, { useState } from "react";

interface CollapsibleSectionProps {
  title: string;
  defaultExpanded?: boolean;
  children: React.ReactNode;
  variant?: "default" | "danger";
}

export function CollapsibleSection({ title, defaultExpanded = false, children, variant = "default" }: CollapsibleSectionProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div className={`collapsible-section${variant === "danger" ? " collapsible-danger" : ""}`}>
      <button
        className="collapsible-header"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        aria-label={`${expanded ? "Collapse" : "Expand"} ${title}`}
      >
        <span className={`collapsible-title${variant === "danger" ? " danger-title" : ""}`}>{title}</span>
        <svg
          className={`collapsible-chevron${expanded ? " collapsible-chevron-open" : ""}`}
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden="true"
        >
          <path d="M4 6L8 10L12 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {expanded && <div className="collapsible-content">{children}</div>}
    </div>
  );
}
