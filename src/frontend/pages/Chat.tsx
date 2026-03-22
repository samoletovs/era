import React, { useState } from "react";
import { useApp } from "../utils/context";

interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
}

const API_BASE = "/api";

// TODO: Replace with real auth token from login flow
const AUTH_TOKEN = "dev-bypass";

export function Chat() {
  const { companyId, setCompanyId } = useApp();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      role: "system",
      content: "ERA agent is ready. Ask me to create a company, invoices, record payments, or check your finances.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSend() {
    if (!input.trim() || loading) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input.trim(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const history = messages
        .filter((m) => m.role !== "system")
        .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

      const res = await fetch(`${API_BASE}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${AUTH_TOKEN}`,
        },
        body: JSON.stringify({
          companyId: companyId || undefined,
          message: userMsg.content,
          history,
        }),
      });

      const json = await res.json();
      const responseText = json.data?.response || json.error?.message || "No response from agent";

      // Try to extract companyId from response if a company was created
      if (!companyId && responseText.includes("company") && json.data?.response) {
        const match = responseText.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
        if (match) setCompanyId(match[0]);
      }

      const assistantMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: responseText,
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: `Connection error: ${err instanceof Error ? err.message : "Could not reach the backend. Is it running on port 3000?"}`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h2 className="page-title">Agent chat</h2>
      {companyId && (
        <div style={{ fontSize: "12px", color: "#A0A0A0", marginBottom: 8, fontFamily: "monospace" }}>
          Company: {companyId}
        </div>
      )}
      <div className="chat-container">
        <div className="chat-header">ERA orchestrator agent</div>
        <div className="chat-messages">
          {messages.map((msg) => (
            <div key={msg.id} className={`chat-message ${msg.role}`}>
              {msg.content}
            </div>
          ))}
          {loading && (
            <div className="chat-message assistant" style={{ opacity: 0.5 }}>
              Thinking...
            </div>
          )}
        </div>
        <div className="chat-input-area">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="Create a company, invoice, record payment..."
            disabled={loading}
          />
          <button className="btn-primary" onClick={handleSend} disabled={loading}>
            {loading ? "..." : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}
