import React from "react";
import { BrowserRouter, Routes, Route, NavLink, useNavigate, useLocation } from "react-router-dom";
import { AppProvider, useApp } from "./utils/context";
import { api } from "./utils/api";
import { Dashboard } from "./pages/Dashboard";
import { Chat } from "./pages/Chat";
import { Accounts } from "./pages/Accounts";
import { Invoices } from "./pages/Invoices";
import { Contacts } from "./pages/Contacts";
import { Items } from "./pages/Items";
import { Reports } from "./pages/Reports";
import { Onboarding } from "./pages/Onboarding";
import { Settings } from "./pages/Settings";
import { UploadInvoice } from "./pages/UploadInvoice";
import { FixedAssets } from "./pages/FixedAssets";
import { BankRecon } from "./pages/BankRecon";
import { RecurringEntries } from "./pages/RecurringEntries";
import { EventLog } from "./pages/EventLog";
import { Accounting } from "./pages/Accounting";

function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { companies, companyId, setCompanyId } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const [switcherOpen, setSwitcherOpen] = React.useState(false);
  const activeCompany = companies.find((c) => c.id === companyId);

  // Close sidebar on navigation (mobile)
  React.useEffect(() => { onClose(); }, [location.pathname]);

  return (
    <>
      {open && <div className="sidebar-overlay" onClick={onClose} />}
      <aside className={`app-sidebar ${open ? "open" : ""}`}>
        <div className="sidebar-top-row">
          <div className="logo">ERA <span>v0.1</span></div>
          <button className="sidebar-close" onClick={onClose} aria-label="Close menu">✕</button>
        </div>

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
        <NavLink to="/upload">Upload invoice</NavLink>
        <NavLink to="/contacts">Contacts</NavLink>
        <NavLink to="/items">Items</NavLink>
        <NavLink to="/fixed-assets">Fixed assets</NavLink>
        <NavLink to="/bank">Bank recon</NavLink>
        <NavLink to="/recurring">Recurring</NavLink>
        <NavLink to="/reports">Reports</NavLink>
        <NavLink to="/accounting">Accounting</NavLink>
        <NavLink to="/events">Event log</NavLink>
        <NavLink to="/settings">Settings</NavLink>
      </nav>

      <div className="sidebar-bottom">
        <button className="btn-add-company" onClick={() => navigate("/onboarding")}>
          + Add company
        </button>
      </div>
    </aside>
    </>
  );
}

function FeedbackButton() {
  const { companyId } = useApp();
  const location = useLocation();
  const [open, setOpen] = React.useState(false);
  const [message, setMessage] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [sent, setSent] = React.useState(false);

  function handleSubmit() {
    if (!message.trim()) return;
    setSending(true);
    api.submitFeedback({ page: location.pathname, message: message.trim(), companyId: companyId || undefined })
      .then(() => { setSent(true); setMessage(""); setTimeout(() => { setOpen(false); setSent(false); }, 1500); })
      .catch(() => setSending(false))
      .finally(() => setSending(false));
  }

  return (
    <>
      <button className="feedback-fab" onClick={() => { setOpen(!open); setSent(false); }} title="Send feedback">
        {open ? "✕" : "💬"}
      </button>
      {open && (
        <div className="feedback-popover">
          {sent ? (
            <div className="feedback-sent">
              <span>✓</span> Thanks for your feedback!
            </div>
          ) : (
            <>
              <div className="feedback-header">Send feedback</div>
              <textarea
                className="feedback-textarea"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="What could be better? Report a bug, suggest a feature..."
                rows={4}
                maxLength={2000}
                autoFocus
              />
              <div className="feedback-footer">
                <span className="feedback-page">{location.pathname}</span>
                <button className="btn-primary" onClick={handleSubmit} disabled={sending || !message.trim()}>
                  {sending ? "Sending..." : "Submit"}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}

export function App() {
  const [sidebarOpen, setSidebarOpen] = React.useState(false);

  return (
    <AppProvider>
      <BrowserRouter>
        <div className="app">
          <div className="mobile-header">
            <button className="hamburger-btn" onClick={() => setSidebarOpen(true)} aria-label="Open menu">
              <span /><span /><span />
            </button>
            <div className="mobile-logo">ERA</div>
          </div>
          <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
          <main className="app-main">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/chat" element={<Chat />} />
              <Route path="/accounts" element={<Accounts />} />
              <Route path="/invoices" element={<Invoices />} />
              <Route path="/upload" element={<UploadInvoice />} />
              <Route path="/contacts" element={<Contacts />} />
              <Route path="/items" element={<Items />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/fixed-assets" element={<FixedAssets />} />
              <Route path="/bank" element={<BankRecon />} />
              <Route path="/recurring" element={<RecurringEntries />} />
              <Route path="/events" element={<EventLog />} />
              <Route path="/accounting" element={<Accounting />} />
              <Route path="/onboarding" element={<Onboarding />} />
              <Route path="/settings" element={<Settings />} />
            </Routes>
          </main>
          <FeedbackButton />
        </div>
      </BrowserRouter>
    </AppProvider>
  );
}
