import React, { useState, useRef } from "react";

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
  display: "block", fontSize: 11, fontWeight: 500, color: "var(--text-tertiary)",
  textTransform: "uppercase", letterSpacing: "0.02em", marginBottom: 4,
};

/**
 * Universal AI data entry component with text input + voice recording + submit button.
 * Used on Items, Invoices, Fixed Assets, Contacts, Recurring Entries, etc.
 */
export function AiInput({ placeholder, label, buttonLabel, loadingLabel, onSubmit, disabled, clearOnSubmit = true }: AiInputProps) {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(text?: string) {
    const desc = text || prompt;
    if (!desc.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await onSubmit(desc.trim());
      if (clearOnSubmit) setPrompt("");
    } catch (err: any) {
      setError(err.message || "Failed to parse description");
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  function toggleVoice() {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    if (listening && recognitionRef.current) {
      recognitionRef.current.stop();
      setListening(false);
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
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

  const speechSupported = typeof window !== "undefined" &&
    (Boolean((window as any).SpeechRecognition) || Boolean((window as any).webkitSpeechRecognition));

  return (
    <div>
      {label && <label style={labelStyle}>{label}</label>}
      <div style={{ display: "flex", gap: 8, alignItems: "stretch", flexWrap: "wrap" }}>
        <input
          ref={inputRef}
          type="text"
          value={prompt}
          onChange={e => { setPrompt(e.target.value); if (error) setError(null); }}
          onKeyDown={e => { if (e.key === "Enter" && !loading && !disabled) handleSubmit(); }}
          placeholder={placeholder || "Describe what you want to create..."}
          className="form-input"
          style={{ flex: 1, minWidth: 0, fontSize: 16 }}
          disabled={disabled || loading}
          aria-label={label || "AI description input"}
        />
        <button
          className="btn-primary"
          onClick={() => handleSubmit()}
          disabled={disabled || loading || !prompt.trim()}
          style={{ whiteSpace: "nowrap" }}
        >
          {loading ? (loadingLabel || "Thinking...") : (buttonLabel || "✨ Fill fields")}
        </button>
        {speechSupported && (
          <button
            className={listening ? "btn-primary" : "btn-secondary"}
            onClick={toggleVoice}
            title={listening ? "Stop listening" : "Voice input"}
            aria-label={listening ? "Stop voice input" : "Start voice input"}
            style={{
              width: 40, minWidth: 40, padding: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 18,
              ...(listening ? { animation: "pulse 1.5s ease-in-out infinite" } : {}),
            }}
          >
            🎙
          </button>
        )}
      </div>
      {listening && (
        <p style={{ fontSize: "var(--text-sm)", color: "var(--accent)", marginTop: 4, marginBottom: 0 }}>
          Listening... speak now
        </p>
      )}
      {error && (
        <p style={{ fontSize: "var(--text-sm)", color: "var(--error, #FF3B30)", marginTop: 4, marginBottom: 0 }}>
          {error}
        </p>
      )}
    </div>
  );
}
