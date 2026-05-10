import React, { useState, useRef } from 'react';
import { formatApiError } from '../utils/api';

interface AiInputProps {
  /** Placeholder text for the input field */
  placeholder?: string;
  /** Label text shown above the input */
  label?: string;
  /** Text for the submit button (default: "✨ Fill fields") */
  buttonLabel?: string;
  /** Text shown while loading (default: "Thinking...") */
  loadingLabel?: string;
  /** Called when user submits text — should return the parsed result or throw */
  onSubmit: (text: string) => Promise<void>;
  /** Disable the entire component */
  disabled?: boolean;
  /** Clear input after successful submit (default: true) */
  clearOnSubmit?: boolean;
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 11,
  fontWeight: 500,
  color: 'var(--text-tertiary)',
  textTransform: 'uppercase',
  letterSpacing: '0.02em',
  marginBottom: 4,
};

/**
 * Universal AI data entry component with text input + voice recording + submit button.
 * Used on Items, Invoices, Fixed Assets, Contacts, Recurring Entries, etc.
 */
export function AiInput({
  placeholder,
  label,
  buttonLabel,
  loadingLabel,
  onSubmit,
  disabled,
  clearOnSubmit = true,
}: AiInputProps) {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  async function handleSubmit(text?: string) {
    const desc = text || prompt;
    if (!desc.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await onSubmit(desc.trim());
      if (clearOnSubmit) setPrompt('');
    } catch (err: unknown) {
      setError(formatApiError(err));
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  function toggleVoice() {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    if (listening && recognitionRef.current) {
      recognitionRef.current.stop();
      setListening(false);
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setPrompt(transcript);
      setListening(false);
      handleSubmit(transcript);
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  }

  const speechSupported =
    typeof window !== 'undefined' &&
    (Boolean((window as any).SpeechRecognition) ||
      Boolean((window as any).webkitSpeechRecognition));

  return (
    <div>
      {label && <label style={labelStyle}>{label}</label>}
      <div className="ai-input-wrap">
        <textarea
          ref={inputRef}
          value={prompt}
          onChange={(e) => {
            setPrompt(e.target.value);
            if (error) setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !loading && !disabled) {
              e.preventDefault();
              handleSubmit();
            }
          }}
          placeholder={placeholder || 'Describe what you need...'}
          className="ai-input-textarea"
          rows={1}
          disabled={disabled || loading}
          aria-label={label || 'AI description input'}
        />
        <div className="ai-input-actions">
          {speechSupported && (
            <button
              className={`ai-input-mic${listening ? ' listening' : ''}`}
              onClick={toggleVoice}
              title={listening ? 'Stop listening' : 'Voice input'}
              aria-label={listening ? 'Stop voice input' : 'Start voice input'}
              type="button"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="5.5" y="1" width="5" height="9" rx="2.5" />
                <path d="M3 7.5a5 5 0 0 0 10 0" />
                <line x1="8" y1="12.5" x2="8" y2="15" />
                <line x1="5.5" y1="15" x2="10.5" y2="15" />
              </svg>
            </button>
          )}
          <button
            className="ai-input-submit"
            onClick={() => handleSubmit()}
            disabled={disabled || loading || !prompt.trim()}
            type="button"
          >
            {loading ? loadingLabel || 'Filling...' : buttonLabel || 'Fill fields'}
          </button>
        </div>
      </div>
      {listening && (
        <p className="ai-input-hint" style={{ color: 'var(--accent)' }}>
          Listening... speak now
        </p>
      )}
      {error && (
        <p className="ai-input-hint" style={{ color: 'var(--error, #FF3B30)' }}>
          {error}
        </p>
      )}
      {!listening && !error && (
        <p className="ai-input-hint">
          Describe what you need — type or use voice. Fields will be filled automatically.
        </p>
      )}
    </div>
  );
}
