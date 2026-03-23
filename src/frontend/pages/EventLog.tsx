import React, { useEffect, useMemo, useState } from "react";
import { api } from "../utils/api";
import { useApp } from "../utils/context";
import { formatDateTime } from "../utils/format";

// Map technical event types to user-friendly labels and icons
const EVENT_DISPLAY: Record<string, { label: string; icon: string }> = {
  "entry.posted":           { label: "Journal entry posted",     icon: "📝" },
  "entry.reversed":         { label: "Journal entry reversed",   icon: "↩️" },
  "invoice.created":        { label: "Invoice created",          icon: "📄" },
  "invoice.posted":         { label: "Invoice posted",           icon: "✅" },
  "invoice.cancelled":      { label: "Invoice cancelled",        icon: "❌" },
  "payment.posted":         { label: "Payment recorded",         icon: "💰" },
  "creditnote.posted":      { label: "Credit note posted",       icon: "📋" },
  "month-end.completed":    { label: "Month-end completed",      icon: "📅" },
  "year-end.closed":        { label: "Year-end closed",          icon: "🗓️" },
  "contact.created":        { label: "Contact created",          icon: "👤" },
  "item.created":           { label: "Item created",             icon: "📦" },
  "company.created":        { label: "Company created",          icon: "🏢" },
  "bank.statement.imported":{ label: "Bank statement imported",  icon: "🏦" },
  "asset.acquired":         { label: "Fixed asset acquired",     icon: "🏗️" },
  "asset.depreciated":      { label: "Depreciation posted",      icon: "📉" },
  "asset.disposed":         { label: "Fixed asset disposed",     icon: "🗑️" },
  "recurring.executed":     { label: "Recurring entry executed",  icon: "🔄" },
  "period.closed":          { label: "Period closed",            icon: "🔒" },
  "period.reopened":        { label: "Period reopened",           icon: "🔓" },
  "vat.return.generated":   { label: "VAT return generated",    icon: "📊" },
};

function getEventLabel(type: string): string {
  return EVENT_DISPLAY[type]?.label || type.replace(/\./g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function getEventIcon(type: string): string {
  return EVENT_DISPLAY[type]?.icon || "📌";
}

// Build a human-readable summary from event data
function summarizeData(type: string, data: Record<string, any> | undefined): string {
  if (!data) return "";
  const parts: string[] = [];

  if (data.invoiceNumber) parts.push(data.invoiceNumber);
  if (data.contactName) parts.push(data.contactName);
  if (data.amount) parts.push(`€${Number(data.amount).toFixed(2)}`);
  if (data.total) parts.push(`€${Number(data.total).toFixed(2)}`);
  if (data.period) parts.push(`Period ${data.period}`);
  if (data.fiscalYear) parts.push(`FY ${data.fiscalYear}`);
  if (data.description && !data.invoiceNumber) parts.push(data.description);
  if (data.entryNumber) parts.push(`#${data.entryNumber}`);
  if (data.name && !data.contactName) parts.push(data.name);
  if (data.stepsCompleted !== null) parts.push(`${data.stepsCompleted} step${data.stepsCompleted !== 1 ? "s" : ""} completed`);

  if (parts.length === 0) {
    // Fallback: show key-value pairs but with readable keys
    return Object.entries(data)
      .filter(([k]) => !["companyId", "id", "docType", "documentId"].includes(k))
      .slice(0, 3)
      .map(([k, v]) => `${k.replace(/([A-Z])/g, " $1").toLowerCase().trim()}: ${v}`)
      .join(" · ");
  }
  return parts.join(" · ");
}

type SortField = "timestamp" | "type";
type SortDir = "asc" | "desc";

export function EventLog() {
  const { companyId, dateFormat, dateTimeFormat } = useApp();
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [sortField, setSortField] = useState<SortField>("timestamp");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  useEffect(() => {
    if (!companyId) return;
    api.events(companyId, 200).then((d: any) => setEvents(d as any[])).catch(() => {}).finally(() => setLoading(false));
  }, [companyId]);

  if (!companyId) return <div className="empty-state"><div className="icon">🏢</div><h3>No company selected</h3><p>Add a company first to view events.</p></div>;

  const typeColors: Record<string, string> = {
    "entry.posted": "badge-posted", "entry.reversed": "badge-cancelled",
    "invoice.created": "badge-draft", "invoice.posted": "badge-posted",
    "payment.posted": "badge-paid", "creditnote.posted": "badge-overdue",
    "month-end.completed": "badge-paid", "year-end.closed": "badge-paid",
    "contact.created": "badge-posted", "item.created": "badge-posted",
    "company.created": "badge-posted", "bank.statement.imported": "badge-posted",
    "asset.acquired": "badge-posted", "recurring.executed": "badge-posted",
    "period.closed": "badge-paid",
  };

  const eventTypes = useMemo(() => {
    const types = new Set(events.map(e => e.type));
    return Array.from(types).sort();
  }, [events]);

  const filteredEvents = useMemo(() => {
    const q = search.toLowerCase().trim();
    let list = events;
    if (q) {
      list = list.filter(e =>
        getEventLabel(e.type).toLowerCase().includes(q) ||
        e.type?.toLowerCase().includes(q) ||
        summarizeData(e.type, e.data).toLowerCase().includes(q)
      );
    }
    if (typeFilter) {
      list = list.filter(e => e.type === typeFilter);
    }
    // Sort
    list = [...list].sort((a, b) => {
      let cmp = 0;
      if (sortField === "timestamp") {
        cmp = (a.timestamp || "").localeCompare(b.timestamp || "");
      } else {
        cmp = (a.type || "").localeCompare(b.type || "");
      }
      return sortDir === "desc" ? -cmp : cmp;
    });
    return list;
  }, [events, search, typeFilter, sortField, sortDir]);

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  }

  const sortIndicator = (field: SortField) =>
    sortField === field ? (sortDir === "asc" ? " ↑" : " ↓") : "";

  return (
    <div>
      <h2 className="page-title">Event log</h2>

      <div style={{ display: "flex", gap: 10, marginBottom: 16, alignItems: "center" }}>
        <input
          type="text"
          placeholder="Search events..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="table-search-input"
          aria-label="Search events"
        />
        <select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
          className="table-filter-select"
          aria-label="Filter by event type"
        >
          <option value="">All events</option>
          {eventTypes.map(t => (
            <option key={t} value={t}>{getEventLabel(t)}</option>
          ))}
        </select>
        {(search || typeFilter) && (
          <span style={{ fontSize: "var(--text-sm)", color: "var(--text-tertiary)" }}>
            {filteredEvents.length} result{filteredEvents.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {loading ? <p style={{ color: "#A0A0A0" }}>Loading...</p> : filteredEvents.length === 0 ? (
        events.length === 0 ? (
          <div className="empty-state"><div className="icon">📋</div><h3>No events yet</h3><p>Actions like posting invoices and payments will appear here.</p></div>
        ) : (
          <div className="empty-state"><div className="icon">🔍</div><h3>No matching events</h3><p>Try adjusting your search or filters.</p></div>
        )
      ) : (
        <table className="data-table">
          <thead><tr>
            <th style={{ cursor: "pointer", userSelect: "none" }} onClick={() => toggleSort("timestamp")}>Time{sortIndicator("timestamp")}</th>
            <th style={{ cursor: "pointer", userSelect: "none" }} onClick={() => toggleSort("type")}>Event{sortIndicator("type")}</th>
            <th>Details</th>
          </tr></thead>
          <tbody>
            {filteredEvents.map((e: any) => (
              <tr key={e.id}>
                <td style={{ fontSize: "var(--text-sm)", whiteSpace: "nowrap", color: "var(--text-secondary)" }}>
                  {formatDateTime(e.timestamp, dateFormat, dateTimeFormat)}
                </td>
                <td>
                  <span style={{ marginRight: 6 }}>{getEventIcon(e.type)}</span>
                  <span className={`badge ${typeColors[e.type] || ""}`}>{getEventLabel(e.type)}</span>
                </td>
                <td style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>
                  {summarizeData(e.type, e.data)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
