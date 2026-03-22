import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Dashboard } from "./pages/Dashboard";

export function App() {
  return (
    <BrowserRouter>
      <div className="app">
        <header className="app-header">
          <h1>ERA</h1>
          <nav>
            <a href="/dashboard">Dashboard</a>
            <a href="/finance">Finance</a>
            <a href="/inventory">Inventory</a>
            <a href="/sales">Sales</a>
            <a href="/procurement">Procurement</a>
            <a href="/hr">HR</a>
          </nav>
        </header>
        <main className="app-main">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/dashboard" element={<Dashboard />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
