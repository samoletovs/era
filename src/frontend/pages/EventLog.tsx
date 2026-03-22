import React, { useEffect, useState } from "react";
import { api } from "../utils/api";
import { useApp } from "../utils/context";

export function EventLog() {
  const { companyId } = useApp();
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!companyId) return;
    api.events(companyId, 100).then((d: any) => setEvents(d as any[])).catch(() => {}).finally(() => setLoading(false));
  }, [companyId]);

  if (!companyId) return <div className="empty-state"><div className="icon">🏢</div><h3>No company selected</h3></div>;

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

  return (
    <div>
      <h2 className="page-title">Event log</h2>
      {loading ? <p style={{ color: "#A0A0A0" }}>Loading...</p> : events.length === 0 ? (
        <div className="empty-state"><div className="icon">📋</div><h3>No events yet</h3><p>Actions like posting invoices and payments will appear here.</p></div>
      ) : (
        <table className="data-table">
          <thead><tr><th>Time</th><th>Event</th><th>Document</th><th>Details</th></tr></thead>
          <tbody>
            {events.map((e: any) => (
              <tr key={e.id}>
                <td className="mono" style={{ fontSize: "var(--text-sm)", whiteSpace: "nowrap" }}>{new Date(e.timestamp).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</td>
                <td><span className={`badge ${typeColors[e.type] || ""}`}>{e.type}</span></td>
                <td className="mono" style={{ fontSize: "var(--text-sm)" }}>{e.documentType || ""}</td>
                <td style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>
                  {e.data ? Object.entries(e.data).map(([k, v]) => `${k}: ${v}`).join(" · ") : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
