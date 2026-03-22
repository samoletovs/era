import React from "react";
import { BrowserRouter, Routes, Route, NavLink } from "react-router-dom";
import { AppProvider } from "./utils/context";
import { Dashboard } from "./pages/Dashboard";
import { Chat } from "./pages/Chat";
import { Accounts } from "./pages/Accounts";
import { Invoices } from "./pages/Invoices";
import { Contacts } from "./pages/Contacts";
import { Items } from "./pages/Items";
import { Reports } from "./pages/Reports";

export function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <div className="app">
          <aside className="app-sidebar">
            <div className="logo">
              ERA <span>v0.1</span>
            </div>
            <nav>
              <NavLink to="/" end>Dashboard</NavLink>
              <NavLink to="/chat">Agent chat</NavLink>
              <NavLink to="/accounts">Chart of accounts</NavLink>
              <NavLink to="/invoices">Invoices</NavLink>
              <NavLink to="/contacts">Contacts</NavLink>
              <NavLink to="/items">Items</NavLink>
              <NavLink to="/reports">Reports</NavLink>
            </nav>
          </aside>
          <main className="app-main">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/chat" element={<Chat />} />
              <Route path="/accounts" element={<Accounts />} />
              <Route path="/invoices" element={<Invoices />} />
              <Route path="/contacts" element={<Contacts />} />
              <Route path="/items" element={<Items />} />
              <Route path="/reports" element={<Reports />} />
            </Routes>
          </main>
        </div>
      </BrowserRouter>
    </AppProvider>
  );
}
