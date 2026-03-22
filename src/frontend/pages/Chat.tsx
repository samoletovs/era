import React, { useState } from "react";

interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
}

export function Chat() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      role: "system",
      content: "ERA agent is ready. Ask me to create invoices, record transactions, or check your finances.",
    },
  ]);
  const [input, setInput] = useState("");

  function handleSend() {
    if (!input.trim()) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input.trim(),
    };

    // Placeholder response — will connect to backend agent
    const assistantMsg: Message = {
      id: (Date.now() + 1).toString(),
      role: "assistant",
      content: "I understand your request. The agent backend is not yet connected — this will be implemented in Phase 3. For now, the UI framework is ready.",
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setInput("");
  }

  return (
    <div>
      <h2 className="page-title">Agent chat</h2>
      <div className="chat-container">
        <div className="chat-header">ERA orchestrator agent</div>
        <div className="chat-messages">
          {messages.map((msg) => (
            <div key={msg.id} className={`chat-message ${msg.role}`}>
              {msg.content}
            </div>
          ))}
        </div>
        <div className="chat-input-area">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="Ask ERA to create an invoice, check balances, or manage contacts..."
          />
          <button className="btn-primary" onClick={handleSend}>
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
