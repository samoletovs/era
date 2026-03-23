import React from "react";

interface PageHeaderProps {
  title: string;
  children?: React.ReactNode; // Action buttons, filters, etc.
}

/** Standard page header with title and optional action buttons */
export function PageHeader({ title, children }: PageHeaderProps) {
  return (
    <div className="page-header-bar">
      <h2 className="page-title">{title}</h2>
      {children && <div className="action-buttons" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{children}</div>}
    </div>
  );
}

interface EmptyStateProps {
  icon?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

/** Centered empty state — replaces scattered "no data" patterns */
export function EmptyState({ icon = "📋", title, description, action }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <div className="icon">{icon}</div>
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {action && <div style={{ marginTop: 16 }}>{action}</div>}
    </div>
  );
}

interface FilterBarProps {
  children: React.ReactNode;
}

/** Horizontal bar for search input + filter dropdowns + count */
export function FilterBar({ children }: FilterBarProps) {
  return <div className="filter-bar">{children}</div>;
}

interface SortHeaderProps {
  label: string;
  field: string;
  currentSort: string;
  currentDir: "asc" | "desc";
  onSort: (field: string) => void;
  align?: "left" | "right";
}

/** Sortable table header cell */
export function SortHeader({ label, field, currentSort, currentDir, onSort, align }: SortHeaderProps) {
  const active = currentSort === field;
  return (
    <th
      className={`sortable-th${active ? " sorted" : ""}`}
      onClick={() => onSort(field)}
      style={align === "right" ? { textAlign: "right" } : undefined}
    >
      {label}
      {active && <span className="sort-indicator">{currentDir === "asc" ? " ▲" : " ▼"}</span>}
    </th>
  );
}
