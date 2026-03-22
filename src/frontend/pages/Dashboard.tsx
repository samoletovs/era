import React from "react";

export function Dashboard() {
  return (
    <div>
      <h2 className="page-title">Dashboard</h2>

      <div className="dashboard-grid">
        <div className="metric-card">
          <div className="label">Cash position</div>
          <div className="value">€0.00</div>
          <div className="subtitle">Bank + cash accounts</div>
        </div>
        <div className="metric-card">
          <div className="label">Receivables</div>
          <div className="value">€0.00</div>
          <div className="subtitle">Outstanding invoices</div>
        </div>
        <div className="metric-card">
          <div className="label">Payables</div>
          <div className="value">€0.00</div>
          <div className="subtitle">Bills to pay</div>
        </div>
        <div className="metric-card">
          <div className="label">VAT due</div>
          <div className="value">€0.00</div>
          <div className="subtitle">Current period</div>
        </div>
      </div>

      <div className="metric-card">
        <div className="label">Recent agent actions</div>
        <div className="empty-state">
          <div className="icon">🤖</div>
          <h3>No recent activity</h3>
          <p>Your ERA agents will show their actions here. Start by chatting with the agent to create your first invoice or record a transaction.</p>
        </div>
      </div>
    </div>
  );
}
