import React, { useMemo, useState } from "react";
import { api, type BusinessEventData } from "../utils/api";
import { useApp } from "../utils/context";
import { formatDateTime } from "../utils/format";
import { useApiData } from "../hooks/useApiData";
import { PageHeader, EmptyState, FilterBar, SortHeader } from "../components/PageControls";

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
  const { data: events, loading } = useApiData<BusinessEventData[]>(
    companyId ? () => api.events(companyId, 200) : null,
    [companyId]
  );
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [sortField, setSortField] = useState<SortField>("timestamp");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  if (!companyId) return <EmptyState icon="🏢" title="No company selected" description="Add a company first to view events." />;

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
    const types = new Set((events || []).map(e => e.type));
    return Array.from(types).sort();
  }, [events]);

  const filteredEvents = useMemo(() => {
    const q = search.toLowerCase().trim();
    let list = events || [];
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

  return (
    <div>
      <PageHeader title="Event log" />

      <FilterBar>
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
      </FilterBar>

      {loading ? <p style={{ color: "#A0A0A0" }}>Loading...</p> : filteredEvents.length === 0 ? (
        (events || []).length === 0 ? (
          <EmptyState icon="📋" title="No events yet" description="Actions like posting invoices and payments will appear here." />
        ) : (
          <EmptyState icon="🔍" title="No matching events" description="Try adjusting your search or filters." />
        )
      ) : (
        <table className="data-table">
          <thead><tr>
            <SortHeader label="Time" field="timestamp" currentSort={sortField} currentDir={sortDir} onSort={(f) => toggleSort(f as SortField)} />
            <SortHeader label="Event" field="type" currentSort={sortField} currentDir={sortDir} onSort={(f) => toggleSort(f as SortField)} />
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
