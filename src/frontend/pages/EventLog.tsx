import React from "react";
import { api, type BusinessEventData } from "../utils/api";
import { useApp } from "../utils/context";
import { formatDateTime } from "../utils/format";
import { useApiData } from "../hooks/useApiData";
import { PageHeader, EmptyState } from "../components/PageControls";
import { UniversalGrid, type GridColumn } from "../components/UniversalGrid";

// Map technical event types to user-friendly labels and icons
const EVENT_DISPLAY: Record<string, { label: string; icon: string }> = {
  "entry.posted": { label: "Journal entry posted", icon: "📝" },
  "entry.reversed": { label: "Journal entry reversed", icon: "↩️" },
  "invoice.created": { label: "Invoice created", icon: "📄" },
  "invoice.posted": { label: "Invoice posted", icon: "✅" },
  "invoice.cancelled": { label: "Invoice cancelled", icon: "❌" },
  "payment.posted": { label: "Payment recorded", icon: "💰" },
  "creditnote.posted": { label: "Credit note posted", icon: "📋" },
  "month-end.completed": { label: "Month-end completed", icon: "📅" },
  "year-end.closed": { label: "Year-end closed", icon: "🗓️" },
  "contact.created": { label: "Contact created", icon: "👤" },
  "item.created": { label: "Item created", icon: "📦" },
  "company.created": { label: "Company created", icon: "🏢" },
  "bank.statement.imported": { label: "Bank statement imported", icon: "🏦" },
  "asset.acquired": { label: "Fixed asset acquired", icon: "🏗️" },
  "asset.depreciated": { label: "Depreciation posted", icon: "📉" },
  "asset.disposed": { label: "Fixed asset disposed", icon: "🗑️" },
  "recurring.executed": { label: "Recurring entry executed", icon: "🔄" },
  "period.closed": { label: "Period closed", icon: "🔒" },
  "period.reopened": { label: "Period reopened", icon: "🔓" },
  "vat.return.generated": { label: "VAT return generated", icon: "📊" },
};

function getEventLabel(type: string): string {
  return (
    EVENT_DISPLAY[type]?.label ||
    type.replace(/\./g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

function getEventIcon(type: string): string {
  return EVENT_DISPLAY[type]?.icon || "📌";
}

// Build a human-readable summary from event data
function summarizeData(
  type: string,
  data: Record<string, any> | undefined,
): string {
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
  if (data.stepsCompleted !== null)
    parts.push(
      `${data.stepsCompleted} step${data.stepsCompleted !== 1 ? "s" : ""} completed`,
    );

  if (parts.length === 0) {
    // Fallback: show key-value pairs but with readable keys
    return Object.entries(data)
      .filter(
        ([k]) => !["companyId", "id", "docType", "documentId"].includes(k),
      )
      .slice(0, 3)
      .map(
        ([k, v]) =>
          `${k
            .replace(/([A-Z])/g, " $1")
            .toLowerCase()
            .trim()}: ${v}`,
      )
      .join(" · ");
  }
  return parts.join(" · ");
}

export function EventLog() {
  const { companyId, dateFormat, dateTimeFormat } = useApp();
  const { data: events, loading } = useApiData<BusinessEventData[]>(
    companyId ? () => api.events(companyId, 200) : null,
    [companyId],
  );

  if (!companyId)
    return (
      <EmptyState
        icon="🏢"
        title="No company selected"
        description="Add a company first to view events."
      />
    );

  const typeColors: Record<string, string> = {
    "entry.posted": "badge-posted",
    "entry.reversed": "badge-cancelled",
    "invoice.created": "badge-draft",
    "invoice.posted": "badge-posted",
    "payment.posted": "badge-paid",
    "creditnote.posted": "badge-overdue",
    "month-end.completed": "badge-paid",
    "year-end.closed": "badge-paid",
    "contact.created": "badge-posted",
    "item.created": "badge-posted",
    "company.created": "badge-posted",
    "bank.statement.imported": "badge-posted",
    "asset.acquired": "badge-posted",
    "recurring.executed": "badge-posted",
    "period.closed": "badge-paid",
  };

  const gridColumns: GridColumn<BusinessEventData>[] = [
    {
      id: "timestamp",
      header: "Time",
      accessor: (e) => e.timestamp || "",
      render: (e) => (
        <span
          style={{
            fontSize: "var(--text-sm)",
            whiteSpace: "nowrap",
            color: "var(--text-secondary)",
          }}
        >
          {formatDateTime(e.timestamp, dateFormat, dateTimeFormat)}
        </span>
      ),
    },
    {
      id: "type",
      header: "Event",
      accessor: (e) => getEventLabel(e.type),
      render: (e) => (
        <>
          <span style={{ marginRight: 6 }}>{getEventIcon(e.type)}</span>
          <span className={`badge ${typeColors[e.type] || ""}`}>
            {getEventLabel(e.type)}
          </span>
        </>
      ),
    },
    {
      id: "details",
      header: "Details",
      accessor: (e) => summarizeData(e.type, e.data),
      render: (e) => (
        <span
          style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}
        >
          {summarizeData(e.type, e.data)}
        </span>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title="Event log" />

      {loading ? (
        <p style={{ color: "#A0A0A0" }}>Loading...</p>
      ) : (events || []).length === 0 ? (
        <EmptyState
          icon="📋"
          title="No events yet"
          description="Actions like posting invoices and payments will appear here."
        />
      ) : (
        <UniversalGrid
          rows={events || []}
          columns={gridColumns}
          rowKey={(e) => e.id}
          searchPlaceholder="Search events..."
          emptyMessage="No matching events. Try adjusting your filters."
          initialSort={{ columnId: "timestamp", direction: "desc" }}
        />
      )}
    </div>
  );
}
