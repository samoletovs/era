import React, { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router';
import { useApp } from '../utils/context';
import { api, getAuthToken } from '../utils/api';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
}

const API_BASE = '/api';

// Safe markdown-like renderer: bold, lists, newlines — no dangerouslySetInnerHTML
function FormattedMessage({ content }: { content: string }) {
  const lines = content.split('\n');
  return (
    <div>
      {lines.map((line, i) => {
        // Parse bold segments: **text** → <strong>text</strong>
        const parts = line.split(/\*\*(.+?)\*\*/g);
        const rendered = parts.map((part, j) =>
          j % 2 === 1 ? (
            <strong key={j}>{part}</strong>
          ) : (
            <React.Fragment key={j}>{part}</React.Fragment>
          ),
        );

        // Numbered list item
        const numMatch = line.match(/^(\d+)\.\s/);
        if (numMatch) {
          return (
            <div key={i} style={{ marginLeft: 16 }}>
              <span className="list-num">{numMatch[1]}.</span> {rendered}
            </div>
          );
        }
        // Bullet list item
        if (line.startsWith('- ')) {
          return (
            <div key={i} style={{ marginLeft: 16 }}>
              {'• '}
              {parts.map((part, j) =>
                j % 2 === 1 ? (
                  <strong key={j}>{part}</strong>
                ) : (
                  <React.Fragment key={j}>{part.replace(/^- /, '')}</React.Fragment>
                ),
              )}
            </div>
          );
        }
        // Normal line
        return (
          <React.Fragment key={i}>
            {rendered}
            {i < lines.length - 1 && <br />}
          </React.Fragment>
        );
      })}
    </div>
  );
}

export function Chat() {
  const { companyId, setCompanyId, companies } = useApp();
  const activeCompany = companies.find((c) => c.id === companyId);
  const location = useLocation();
  const prefillHandled = useRef(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [_historyLoaded, setHistoryLoaded] = useState(false);

  // Load chat history from server when company changes
  useEffect(() => {
    setHistoryLoaded(false);
    if (!companyId) {
      setMessages([
        {
          id: '1',
          role: 'system',
          content:
            'era agent is ready. Ask me to create a company, invoices, record payments, or check your finances.',
        },
      ]);
      setHistoryLoaded(true);
      return;
    }
    api
      .chatHistory(companyId)
      .then((history: any[]) => {
        const systemMsg: Message = {
          id: '1',
          role: 'system',
          content:
            'era agent is ready. Ask me to create a company, invoices, record payments, or check your finances.',
        };
        if (history && history.length > 0) {
          const loaded: Message[] = [
            systemMsg,
            ...history.map((m: any) => ({
              id: m.id,
              role: m.role as 'user' | 'assistant',
              content: m.content,
            })),
          ];
          setMessages(loaded);
        } else {
          setMessages([systemMsg]);
        }
        setHistoryLoaded(true);
      })
      .catch(() => {
        setMessages([
          {
            id: '1',
            role: 'system',
            content:
              'era agent is ready. Ask me to create a company, invoices, record payments, or check your finances.',
          },
        ]);
        setHistoryLoaded(true);
      });
  }, [companyId]);

  // Handle prefilled message from navigation state (e.g., dashboard checklist)
  useEffect(() => {
    const state = location.state as { prefill?: string } | null;
    if (state?.prefill && !prefillHandled.current) {
      prefillHandled.current = true;
      setInput(state.prefill);
      // Clear the state so it doesn't re-trigger on re-render
      window.history.replaceState({}, '');
    }
  }, [location.state]);

  async function handleSend() {
    if (!input.trim() || loading) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const history = messages
        .filter((m) => m.role !== 'system')
        .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

      const res = await fetch(`${API_BASE}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getAuthToken()}`,
        },
        body: JSON.stringify({
          companyId: companyId || undefined,
          message: userMsg.content,
          history,
        }),
      });

      const json = await res.json();
      const responseText = json.data?.response || json.error?.message || 'No response from agent';

      // Try to extract companyId from response if a company was created
      if (!companyId && responseText.includes('company') && json.data?.response) {
        const match = responseText.match(
          /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
        );
        if (match) setCompanyId(match[0]);
      }

      const assistantMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: responseText,
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: `Connection error: ${err instanceof Error ? err.message : 'Could not reach the backend. Is it running on port 3000?'}`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h2 className="page-title chat-page-title">Agent chat</h2>
      {activeCompany && (
        <div style={{ fontSize: '12px', color: '#A0A0A0', marginBottom: 8 }}>
          {activeCompany.name}
        </div>
      )}
      <div className="chat-container">
        <div className="chat-header">era orchestrator agent</div>
        <div className="chat-messages">
          {messages.map((msg) => (
            <div key={msg.id} className={`chat-message ${msg.role}`}>
              <FormattedMessage content={msg.content} />
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
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Create a company, invoice, record payment..."
            disabled={loading}
          />
          <button className="btn-primary" onClick={handleSend} disabled={loading}>
            {loading ? '...' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
}
