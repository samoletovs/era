import React, { useState, useRef } from "react";

interface AiInputProps {
  placeholder?: string;
  buttonLabel?: string;
  loadingLabel?: string;
  onSubmit: (text: string) => Promise<void>;
  disabled?: boolean;
}

/**
 * Universal AI data entry component with text input + voice recording + submit button.
 * Used on Items, Invoices, Fixed Assets, Contacts, Recurring Entries, etc.
 */
export function AiInput({ placeholder, buttonLabel, loadingLabel, onSubmit, disabled }: AiInputProps) {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  async function handleSubmit(text?: string) {
    const desc = text || prompt;
    if (!desc.trim()) return;
    setLoading(true);
    try {
      await onSubmit(desc.trim());
    } finally {
      setLoading(false);
    }
  }

  function toggleVoice() {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Speech recognition is not supported in this browser. Please use Chrome or Edge.");
      return;
    }
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

  return (
    <div>
      <div style={{ display: "flex", gap: 8, alignItems: "stretch", flexWrap: "wrap" }}>
        <input
          type="text"
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !loading) handleSubmit(); }}
          placeholder={placeholder || "Describe what you want to create..."}
          className="form-input"
          style={{ flex: 1, minWidth: 0, fontSize: 16 }}
          disabled={disabled || loading}
          aria-label="AI description input"
        />
        <button
          className="btn-primary"
          onClick={() => handleSubmit()}
          disabled={disabled || loading || !prompt.trim()}
          style={{ whiteSpace: "nowrap" }}
        >
          {loading ? (loadingLabel || "Thinking...") : (buttonLabel || "✨ Fill fields")}
        </button>
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
      </div>
      {listening && (
        <p style={{ fontSize: "var(--text-sm)", color: "var(--accent)", marginTop: 4, marginBottom: 0 }}>
          Listening... speak now
        </p>
      )}
    </div>
  );
}
