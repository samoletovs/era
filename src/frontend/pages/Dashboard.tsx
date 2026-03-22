import React from "react";

export function Dashboard() {
  return (
    <div className="dashboard">
      <h2>Dashboard</h2>
      <div className="dashboard-grid">
        <div className="card">
          <h3>Finance</h3>
          <p>Accounts, invoices, journal entries</p>
        </div>
        <div className="card">
          <h3>Inventory</h3>
          <p>Items, warehouses, stock levels</p>
        </div>
        <div className="card">
          <h3>Sales</h3>
          <p>Orders, customers, quotes</p>
        </div>
        <div className="card">
          <h3>Procurement</h3>
          <p>Purchase orders, vendors</p>
        </div>
        <div className="card">
          <h3>HR</h3>
          <p>Employees, payroll, leave</p>
        </div>
        <div className="card">
          <h3>Reports</h3>
          <p>Analytics, dashboards, exports</p>
        </div>
      </div>
    </div>
  );
}
