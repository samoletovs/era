import React, { Suspense } from 'react';
import { BrowserRouter, Routes, Route, NavLink, useNavigate, useLocation } from 'react-router';
import { AppProvider, useApp } from './utils/context';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Login } from './pages/Login';

// Code splitting — lazy-load pages for faster initial load
const Dashboard = React.lazy(() =>
  import('./pages/Dashboard').then((m) => ({ default: m.Dashboard })),
);
const Chat = React.lazy(() => import('./pages/Chat').then((m) => ({ default: m.Chat })));
const Accounts = React.lazy(() =>
  import('./pages/Accounts').then((m) => ({ default: m.Accounts })),
);
const Invoices = React.lazy(() =>
  import('./pages/Invoices').then((m) => ({ default: m.Invoices })),
);
const Contacts = React.lazy(() =>
  import('./pages/Contacts').then((m) => ({ default: m.Contacts })),
);
const Items = React.lazy(() => import('./pages/Items').then((m) => ({ default: m.Items })));
const Reports = React.lazy(() => import('./pages/Reports').then((m) => ({ default: m.Reports })));
const Onboarding = React.lazy(() =>
  import('./pages/Onboarding').then((m) => ({ default: m.Onboarding })),
);
const Settings = React.lazy(() =>
  import('./pages/Settings').then((m) => ({ default: m.Settings })),
);
const FixedAssets = React.lazy(() =>
  import('./pages/FixedAssets').then((m) => ({ default: m.FixedAssets })),
);
const BankRecon = React.lazy(() =>
  import('./pages/BankRecon').then((m) => ({ default: m.BankRecon })),
);
const JournalEntries = React.lazy(() =>
  import('./pages/JournalEntries').then((m) => ({ default: m.JournalEntries })),
);
const EventLog = React.lazy(() =>
  import('./pages/EventLog').then((m) => ({ default: m.EventLog })),
);
const Accounting = React.lazy(() =>
  import('./pages/Accounting').then((m) => ({ default: m.Accounting })),
);

function PageLoader() {
  return <div style={{ padding: 40, textAlign: 'center', color: '#A0A0A0' }}>Loading...</div>;
}

function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { companies, companyId, setCompanyId, user, logout } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const [switcherOpen, setSwitcherOpen] = React.useState(false);
  const activeCompany = companies.find((c) => c.id === companyId);

  // Close sidebar on navigation (mobile)
  React.useEffect(() => {
    onClose();
  }, [location.pathname]);

  return (
    <>
      {open && <div className="sidebar-overlay" onClick={onClose} />}
      <aside className={`app-sidebar ${open ? 'open' : ''}`}>
        <div className="sidebar-top-row">
          <div className="logo">
            ERA <span>v0.1</span>
          </div>
          <button className="sidebar-close" onClick={onClose} aria-label="Close menu">
            ✕
          </button>
        </div>

        {companies.length > 0 && (
          <div className="company-switcher">
            <button className="switcher-btn" onClick={() => setSwitcherOpen(!switcherOpen)}>
              <span className="switcher-code">{activeCompany?.code || '—'}</span>
              <span className="switcher-name">
                {activeCompany?.shortName || activeCompany?.name || 'Select company'}
              </span>
              <span className="switcher-arrow">{switcherOpen ? '▴' : '▾'}</span>
            </button>
            {switcherOpen && (
              <div className="switcher-dropdown">
                {companies.map((c) => (
                  <button
                    key={c.id}
                    className={`switcher-option ${c.id === companyId ? 'active' : ''}`}
                    onClick={() => {
                      setCompanyId(c.id);
                      setSwitcherOpen(false);
                    }}
                  >
                    <span className="switcher-code">{c.code}</span>
                    <span className="switcher-name">{c.shortName || c.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <nav>
          <NavLink to="/" end>
            Dashboard
          </NavLink>
          <NavLink to="/chat">Agent chat</NavLink>

          <div className="nav-section-label">Finance</div>
          <NavLink to="/invoices">Invoices</NavLink>
          <NavLink to="/bank">Bank</NavLink>
          <NavLink to="/journal">Journal</NavLink>
          <NavLink to="/accounting">Accounting</NavLink>

          <div className="nav-section-label">Master data</div>
          <NavLink to="/accounts">Accounts</NavLink>
          <NavLink to="/contacts">Contacts</NavLink>
          <NavLink to="/items">Items</NavLink>
          <NavLink to="/fixed-assets">Fixed assets</NavLink>

          <div className="nav-section-label">Insights</div>
          <NavLink to="/reports">Reports</NavLink>
          <NavLink to="/events">Event log</NavLink>
          <NavLink to="/settings">Settings</NavLink>
        </nav>

        <div className="sidebar-bottom">
          <button className="btn-add-company" onClick={() => navigate('/onboarding')}>
            + Add company
          </button>
          {user && (
            <div className="sidebar-user">
              <div className="sidebar-user-info">
                {user.photoUrl ? (
                  <img
                    src={user.photoUrl}
                    alt=""
                    className="sidebar-avatar"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="sidebar-avatar-placeholder">
                    {user.displayName?.charAt(0) || user.email?.charAt(0) || '?'}
                  </div>
                )}
                <span className="sidebar-user-email" title={user.email}>
                  {user.email}
                </span>
              </div>
              <button
                className="sidebar-logout"
                onClick={logout}
                aria-label="Sign out"
                title="Sign out"
              >
                ↗
              </button>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

const GITHUB_REPO = 'samoletovs/ERA';
const feedbackTypes = {
  bug: { emoji: '🐛', label: 'Bug report', ghLabel: 'bug' },
  enhancement: { emoji: '💡', label: 'Feature idea', ghLabel: 'enhancement' },
  ux: { emoji: '🎨', label: 'UI/UX improvement', ghLabel: 'ui/ux' },
} as const;
type FeedbackType = keyof typeof feedbackTypes;

function FeedbackButton() {
  const location = useLocation();
  const [open, setOpen] = React.useState(false);
  const [message, setMessage] = React.useState('');
  const [type, setType] = React.useState<FeedbackType>('bug');
  const [sent, setSent] = React.useState(false);

  function handleSubmit() {
    if (!message.trim()) return;
    const info = feedbackTypes[type];
    const title = `[${info.emoji} ${info.label}] ${message.trim().slice(0, 80)}`;
    const body = [
      `## ${info.label}`,
      '',
      message.trim(),
      '',
      '---',
      `*Page: \`${location.pathname}\` · Submitted via in-app feedback*`,
    ].join('\n');
    const url = `https://github.com/${GITHUB_REPO}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}&labels=${encodeURIComponent(info.ghLabel)}`;
    window.open(url, '_blank', 'noopener');
    setSent(true);
    setMessage('');
    setTimeout(() => {
      setOpen(false);
      setSent(false);
    }, 1500);
  }

  return (
    <>
      <button
        className="feedback-fab"
        onClick={() => {
          setOpen(!open);
          setSent(false);
        }}
        title="Send feedback"
      >
        {open ? '✕' : '💬'}
      </button>
      {open && (
        <div className="feedback-popover">
          {sent ? (
            <div className="feedback-sent">
              <span>✓</span> Opening GitHub issue...
            </div>
          ) : (
            <>
              <div className="feedback-header">Send feedback</div>
              <div className="feedback-types">
                {(Object.keys(feedbackTypes) as FeedbackType[]).map((k) => (
                  <button
                    key={k}
                    className={`feedback-type-btn${type === k ? ' active' : ''}`}
                    onClick={() => setType(k)}
                  >
                    {feedbackTypes[k].emoji} {feedbackTypes[k].label}
                  </button>
                ))}
              </div>
              <textarea
                className="feedback-textarea"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Describe the issue or suggestion..."
                rows={4}
                maxLength={2000}
                autoFocus
              />
              <div className="feedback-footer">
                <span className="feedback-page">{location.pathname}</span>
                <button className="btn-primary" onClick={handleSubmit} disabled={!message.trim()}>
                  Create issue
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
  return (
    <ErrorBoundary>
      <AppProvider>
        <AuthGate />
      </AppProvider>
    </ErrorBoundary>
  );
}

function AuthGate() {
  const { isAuthenticated, login } = useApp();

  if (!isAuthenticated) {
    return <Login onLogin={login} />;
  }

  return (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  );
}

function AppShell() {
  const [sidebarOpen, setSidebarOpen] = React.useState(false);
  const location = useLocation();
  const { toasts, dismissToast } = useApp();

  return (
    <div className={`app${location.pathname === '/chat' ? ' chat-active' : ''}`}>
      <div className="mobile-header">
        <button
          className="hamburger-btn"
          onClick={() => setSidebarOpen(true)}
          aria-label="Open menu"
        >
          <span />
          <span />
          <span />
        </button>
        <div className="mobile-logo">ERA</div>
      </div>
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main className="app-main">
        <Suspense fallback={<PageLoader />}>
          <ErrorBoundary>
            <Routes>
              <Route
                path="/"
                element={
                  <ErrorBoundary>
                    <Dashboard />
                  </ErrorBoundary>
                }
              />
              <Route
                path="/chat"
                element={
                  <ErrorBoundary>
                    <Chat />
                  </ErrorBoundary>
                }
              />
              <Route
                path="/accounts"
                element={
                  <ErrorBoundary>
                    <Accounts />
                  </ErrorBoundary>
                }
              />
              <Route
                path="/invoices"
                element={
                  <ErrorBoundary>
                    <Invoices />
                  </ErrorBoundary>
                }
              />
              <Route
                path="/contacts"
                element={
                  <ErrorBoundary>
                    <Contacts />
                  </ErrorBoundary>
                }
              />
              <Route
                path="/items"
                element={
                  <ErrorBoundary>
                    <Items />
                  </ErrorBoundary>
                }
              />
              <Route
                path="/reports"
                element={
                  <ErrorBoundary>
                    <Reports />
                  </ErrorBoundary>
                }
              />
              <Route
                path="/fixed-assets"
                element={
                  <ErrorBoundary>
                    <FixedAssets />
                  </ErrorBoundary>
                }
              />
              <Route
                path="/bank"
                element={
                  <ErrorBoundary>
                    <BankRecon />
                  </ErrorBoundary>
                }
              />
              <Route
                path="/journal"
                element={
                  <ErrorBoundary>
                    <JournalEntries />
                  </ErrorBoundary>
                }
              />
              <Route
                path="/events"
                element={
                  <ErrorBoundary>
                    <EventLog />
                  </ErrorBoundary>
                }
              />
              <Route
                path="/accounting"
                element={
                  <ErrorBoundary>
                    <Accounting />
                  </ErrorBoundary>
                }
              />
              <Route
                path="/onboarding"
                element={
                  <ErrorBoundary>
                    <Onboarding />
                  </ErrorBoundary>
                }
              />
              <Route
                path="/settings"
                element={
                  <ErrorBoundary>
                    <Settings />
                  </ErrorBoundary>
                }
              />
            </Routes>
          </ErrorBoundary>
        </Suspense>
      </main>
      <FeedbackButton />
      {/* Toast notifications */}
      {toasts.length > 0 && (
        <div className="toast-container">
          {toasts.map((t) => (
            <div key={t.id} className={`toast toast-${t.type}`}>
              <span>{t.message}</span>
              <button
                className="toast-dismiss"
                onClick={() => dismissToast(t.id)}
                aria-label="Dismiss"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
