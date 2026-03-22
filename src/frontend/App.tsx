import React from "react";
import { BrowserRouter, Routes, Route, NavLink } from "react-router-dom";
import { Dashboard } from "./pages/Dashboard";
import { Chat } from "./pages/Chat";

export function App() {
  return (
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
          </nav>
        </aside>
        <main className="app-main">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/chat" element={<Chat />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
