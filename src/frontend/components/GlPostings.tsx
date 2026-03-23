import React from "react";

interface GlEntry {
  entryNumber?: string;
  date?: string;
  description?: string;
  status?: string;
  lines?: Array<{
    accountCode: string;
    accountName?: string;
    debit?: number;
    credit?: number;
  }>;
}

interface GlPostingsProps {
  entries: GlEntry[];
  loading?: boolean;
  emptyMessage?: string;
  formatMoney: (amount: number | undefined, fmt: any) => string;
  fmt: any;
}

/**
 * Universal GL posting viewer. Compact, mobile-friendly.
 * Used across Invoices, Fixed Assets, Bank, Contacts, Items, etc.
 */
export function GlPostings({ entries, loading, emptyMessage, formatMoney, fmt }: GlPostingsProps) {
  if (loading) return <p style={{ color: "var(--text-tertiary)", fontSize: "var(--text-sm)" }}>Loading GL entries...</p>;

  if (!entries || entries.length === 0) {
    return <p style={{ color: "var(--text-tertiary)", fontSize: "var(--text-sm)" }}>{emptyMessage || "No GL entries"}</p>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {entries.map((entry, ei) => (
        <div key={ei} style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", overflow: "hidden" }}>
          {/* Entry header */}
          <div style={{
            display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap",
            padding: "8px 12px", background: "var(--bg-subtle)", fontSize: "var(--text-xs)", color: "var(--text-secondary)",
          }}>
            {entry.entryNumber && <span className="mono" style={{ fontWeight: 500 }}>{entry.entryNumber}</span>}
            {entry.date && <span>{entry.date}</span>}
            {entry.description && <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{entry.description}</span>}
            {entry.status === "reversed" && <span className="badge badge-cancelled" style={{ fontSize: 10 }}>reversed</span>}
          </div>
          {/* Lines */}
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--text-sm)" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                <th style={{ padding: "6px 12px", textAlign: "left", fontWeight: 500, color: "var(--text-secondary)", fontSize: "var(--text-xs)" }}>Account</th>
                <th className="hide-mobile" style={{ padding: "6px 12px", textAlign: "left", fontWeight: 500, color: "var(--text-secondary)", fontSize: "var(--text-xs)" }}>Name</th>
                <th style={{ padding: "6px 12px", textAlign: "right", fontWeight: 500, color: "var(--text-secondary)", fontSize: "var(--text-xs)" }}>Debit</th>
                <th style={{ padding: "6px 12px", textAlign: "right", fontWeight: 500, color: "var(--text-secondary)", fontSize: "var(--text-xs)" }}>Credit</th>
              </tr>
            </thead>
            <tbody>
              {entry.lines?.map((l, li) => (
                <tr key={li} style={{ borderBottom: li < (entry.lines?.length || 0) - 1 ? "1px solid #F5F5F5" : "none" }}>
                  <td style={{ padding: "6px 12px" }} className="mono">{l.accountCode}</td>
                  <td className="hide-mobile" style={{ padding: "6px 12px", color: "var(--text-secondary)" }}>{l.accountName}</td>
                  <td style={{ padding: "6px 12px", textAlign: "right", fontFamily: "ui-monospace, Consolas, monospace" }}>{l.debit ? formatMoney(l.debit, fmt) : ""}</td>
                  <td style={{ padding: "6px 12px", textAlign: "right", fontFamily: "ui-monospace, Consolas, monospace" }}>{l.credit ? formatMoney(l.credit, fmt) : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
