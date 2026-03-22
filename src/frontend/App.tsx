import React from "react";
import { BrowserRouter, Routes, Route, NavLink, useNavigate } from "react-router-dom";
import { AppProvider, useApp } from "./utils/context";
import { Dashboard } from "./pages/Dashboard";
import { Chat } from "./pages/Chat";
import { Accounts } from "./pages/Accounts";
import { Invoices } from "./pages/Invoices";
import { Contacts } from "./pages/Contacts";
import { Items } from "./pages/Items";
import { Reports } from "./pages/Reports";
import { Onboarding } from "./pages/Onboarding";
import { Settings } from "./pages/Settings";

function Sidebar() {
  const { companies, companyId, setCompanyId } = useApp();
  const navigate = useNavigate();
  const [switcherOpen, setSwitcherOpen] = React.useState(false);
  const activeCompany = companies.find((c) => c.id === companyId);

  return (
    <aside className="app-sidebar">
      <div className="logo">ERA <span>v0.1</span></div>

      {companies.length > 0 && (
        <div className="company-switcher">
          <button className="switcher-btn" onClick={() => setSwitcherOpen(!switcherOpen)}>
            <span className="switcher-code">{activeCompany?.code || "—"}</span>
            <span className="switcher-name">{activeCompany?.name || "Select company"}</span>
            <span className="switcher-arrow">{switcherOpen ? "▴" : "▾"}</span>
          </button>
          {switcherOpen && (
            <div className="switcher-dropdown">
              {companies.map((c) => (
                <button
                  key={c.id}
                  className={`switcher-option ${c.id === companyId ? "active" : ""}`}
                  onClick={() => { setCompanyId(c.id); setSwitcherOpen(false); }}
                >
                  <span className="switcher-code">{c.code}</span>
                  <span className="switcher-name">{c.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <nav>
        <NavLink to="/" end>Dashboard</NavLink>
        <NavLink to="/chat">Agent chat</NavLink>
        <NavLink to="/accounts">Chart of accounts</NavLink>
        <NavLink to="/invoices">Invoices</NavLink>
        <NavLink to="/contacts">Contacts</NavLink>
        <NavLink to="/items">Items</NavLink>
        <NavLink to="/reports">Reports</NavLink>
        <NavLink to="/settings">Settings</NavLink>
      </nav>

      <div className="sidebar-bottom">
        <button className="btn-add-company" onClick={() => navigate("/onboarding")}>
          + Add company
        </button>
      </div>
    </aside>
  );
}

export function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <div className="app">
          <Sidebar />
          <main className="app-main">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/chat" element={<Chat />} />
              <Route path="/accounts" element={<Accounts />} />
              <Route path="/invoices" element={<Invoices />} />
              <Route path="/contacts" element={<Contacts />} />
              <Route path="/items" element={<Items />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/onboarding" element={<Onboarding />} />
              <Route path="/settings" element={<Settings />} />
            </Routes>
          </main>
        </div>
      </BrowserRouter>
    </AppProvider>
  );
}
