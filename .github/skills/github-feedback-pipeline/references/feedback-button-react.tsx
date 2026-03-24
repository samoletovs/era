// GitHub Feedback Button — React + TypeScript template
//
// Renders a floating feedback button that opens a modal.
// On submit, opens a GitHub issue creation URL pre-filled with the feedback.
//
// CUSTOMIZATION POINTS (marked with TODO):
//   - REPO_OWNER / REPO_NAME — your GitHub repo
//   - typeLabels — feedback categories (emoji, label text, GitHub label)
//   - Styling — adapt to your project's design system
//   - Placement — import and render where appropriate in your app
//
// Works without authentication — uses GitHub's /issues/new URL which
// lets the user submit the issue through GitHub's web UI.

import { useState } from 'react';

// TODO: Replace with your GitHub repo owner and name
const REPO_OWNER = 'YOUR_GITHUB_USERNAME';
const REPO_NAME = 'YOUR_REPO_NAME';

// TODO: Customize feedback categories for your project
// Each category maps to a GitHub label and gets an emoji prefix in the issue title
const typeLabels = {
  bug: { emoji: '🐛', label: 'Bug Report', ghLabel: 'bug' },
  idea: { emoji: '💡', label: 'Feature Idea', ghLabel: 'enhancement' },
  balance: { emoji: '⚖️', label: 'Balance Issue', ghLabel: 'game-balance' },
};

type FeedbackType = keyof typeof typeLabels;

export default function FeedbackButton() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [type, setType] = useState<FeedbackType>('idea');
  const [sent, setSent] = useState(false);

  const handleSubmit = () => {
    if (!text.trim()) return;

    const info = typeLabels[type];
    const title = `[${info.emoji} ${info.label}] ${text.slice(0, 80)}`;
    const body = `## ${info.label}\n\n${text}\n\n---\n*Submitted via in-app feedback*`;

    const url = `https://github.com/${REPO_OWNER}/${REPO_NAME}/issues/new?` +
      `title=${encodeURIComponent(title)}` +
      `&body=${encodeURIComponent(body)}` +
      `&labels=${encodeURIComponent(info.ghLabel)}`;
    window.open(url, '_blank');

    setSent(true);
    setTimeout(() => {
      setOpen(false);
      setSent(false);
      setText('');
    }, 2000);
  };

  // Collapsed state — just a small button
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          padding: '8px 16px',
          borderRadius: '8px',
          fontSize: '14px',
          cursor: 'pointer',
          background: 'rgba(0,0,0,0.05)',
          color: '#666',
          border: '1px solid rgba(0,0,0,0.1)',
        }}
      >
        💬 Feedback
      </button>
    );
  }

  // Expanded modal
  return (
    <div
      onClick={() => setOpen(false)}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: '16px', padding: '24px',
          maxWidth: '420px', width: '100%', boxShadow: '0 16px 48px rgba(0,0,0,0.15)',
        }}
      >
        {sent ? (
          <div style={{ textAlign: 'center', padding: '16px' }}>
            <div style={{ fontSize: '32px', marginBottom: '8px' }}>✅</div>
            <p>Opening GitHub issue...</p>
          </div>
        ) : (
          <>
            <h3 style={{ margin: '0 0 4px', fontSize: '18px' }}>💬 Send Feedback</h3>
            <p style={{ margin: '0 0 16px', fontSize: '12px', color: '#888' }}>
              Creates a GitHub issue for the dev team.
            </p>

            {/* Type selector */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
              {(Object.keys(typeLabels) as FeedbackType[]).map(k => (
                <button
                  key={k}
                  onClick={() => setType(k)}
                  style={{
                    flex: 1, padding: '8px', borderRadius: '8px',
                    fontSize: '12px', fontWeight: 500, cursor: 'pointer',
                    border: type === k ? 'none' : '1px solid transparent',
                    background: type === k ? '#2563eb' : 'rgba(0,0,0,0.04)',
                    color: type === k ? '#fff' : '#666',
                  }}
                >
                  {typeLabels[k].emoji} {typeLabels[k].label}
                </button>
              ))}
            </div>

            {/* Text input */}
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="Describe what you found, what you'd like, or what could be improved..."
              style={{
                width: '100%', height: '100px', borderRadius: '12px', padding: '12px',
                fontSize: '14px', border: '1px solid rgba(0,0,0,0.1)', resize: 'none',
                outline: 'none', boxSizing: 'border-box',
              }}
            />

            <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
              <button
                onClick={() => setOpen(false)}
                style={{
                  flex: 1, padding: '10px', borderRadius: '12px', fontSize: '14px',
                  background: 'rgba(0,0,0,0.04)', color: '#666', border: '1px solid rgba(0,0,0,0.08)',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={!text.trim()}
                style={{
                  flex: 1, padding: '10px', borderRadius: '12px', fontSize: '14px',
                  fontWeight: 600, border: 'none',
                  background: text.trim() ? '#2563eb' : 'rgba(0,0,0,0.06)',
                  color: text.trim() ? '#fff' : '#999',
                  cursor: text.trim() ? 'pointer' : 'not-allowed',
                }}
              >
                Open Issue on GitHub
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
