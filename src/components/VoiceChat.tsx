"use client";

import { useEffect, useRef, useState } from "react";

interface VoiceChatProps {
  role: "worker" | "admin";
  context?: {
    siteName?: string;
    zones?: string[];
    categories?: string[];
    activeIssues?: unknown[];
  };
  onApplyReport?: (data: { category?: string; zone?: string; body?: string }) => void;
  onAdminFilter?: (filter: string) => void;
}

interface Message {
  sender: "user" | "bot";
  text: string;
}

export function VoiceChat({ role, context, onApplyReport, onAdminFilter }: VoiceChatProps) {
  const [open, setOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    {
      sender: "bot",
      text:
        role === "admin"
          ? "Admin Voice Agent active. Speak commands like 'Show critical issues' or 'Read pending closures'."
          : "Voice Safety Assistant ready (Gemma 4 31B). Tell me what happened, and I will help format your report.",
    },
  ]);
  const [busy, setBusy] = useState(false);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const win = window as any;
    const SpeechRec = win.SpeechRecognition || win.webkitSpeechRecognition;
    if (SpeechRec) {
      const rec = new SpeechRec();
      rec.continuous = false;
      rec.interimResults = false;
      rec.lang = "en-IN";

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rec.onresult = (event: any) => {
        const text = event.results[0]?.[0]?.transcript || "";
        setTranscript(text);
        handleSend(text);
      };

      rec.onerror = () => setListening(false);
      rec.onend = () => setListening(false);
      recognitionRef.current = rec;
    }
  }, []);

  const toggleListen = () => {
    if (!recognitionRef.current) {
      alert("Speech recognition is not supported in this browser. Please use Chrome/Edge or type directly.");
      return;
    }

    if (listening) {
      recognitionRef.current.stop();
      setListening(false);
    } else {
      setListening(true);
      recognitionRef.current.start();
    }
  };

  const speak = (text: string) => {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    utterance.onstart = () => setSpeaking(true);
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(utterance);
  };

  const handleSend = async (userText: string) => {
    if (!userText.trim() || busy) return;
    setBusy(true);

    const updated: Message[] = [...messages, { sender: "user", text: userText }];
    setMessages(updated);
    setTranscript("");

    // Admin voice control shortcuts
    if (role === "admin" && onAdminFilter) {
      const lower = userText.toLowerCase();
      if (lower.includes("critical")) onAdminFilter("CRITICAL");
      else if (lower.includes("high")) onAdminFilter("HIGH");
      else if (lower.includes("all")) onAdminFilter("ALL");
    }

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role,
          context,
          messages: updated.map((m) => ({
            role: m.sender === "user" ? "user" : "assistant",
            content: m.text,
          })),
        }),
      });

      const data = await res.json();
      const botText = data.content || "Understood.";
      setMessages([...updated, { sender: "bot", text: botText }]);
      speak(botText);

      // Auto-extract and populate worker fields if reporting
      if (role === "worker" && onApplyReport) {
        onApplyReport({ body: userText });
      }
    } catch {
      const errMsg = "Connection interrupted. Please try speaking again.";
      setMessages([...updated, { sender: "bot", text: errMsg }]);
      speak(errMsg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className="btn btn-primary"
        style={{
          position: "fixed",
          bottom: 24,
          right: 24,
          zIndex: 90,
          boxShadow: "0 8px 24px rgba(23, 19, 15, 0.35)",
          borderRadius: 999,
          padding: "12px 20px",
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
        onClick={() => setOpen(!open)}
        aria-label="Toggle AI Voice Agent"
      >
        <span style={{ fontSize: 18 }}>🎙️</span>
        <span style={{ fontWeight: 600 }}>
          {role === "admin" ? "Admin Voice AI" : "AI Voice Assistant"}
        </span>
      </button>

      {open && (
        <div
          className="card"
          style={{
            position: "fixed",
            bottom: 84,
            right: 24,
            width: "min(380px, calc(100vw - 48px))",
            maxHeight: 480,
            zIndex: 90,
            display: "flex",
            flexDirection: "column",
            boxShadow: "0 20px 50px rgba(23, 19, 15, 0.45)",
            background: "var(--card)",
            borderRadius: 12,
            border: "1px solid var(--line-strong)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: "12px 16px",
              background: "var(--ink)",
              color: "var(--paper)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div>
              <strong style={{ fontSize: 14 }}>
                {role === "admin" ? "Desk Voice AI (Gemma 4 31B)" : "Worker Voice AI (Gemma 4 31B)"}
              </strong>
              <div style={{ fontSize: 10, opacity: 0.8 }}>Web Speech + OpenRouter</div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              style={{
                background: "transparent",
                border: 0,
                color: "var(--paper)",
                cursor: "pointer",
                fontSize: 16,
              }}
            >
              ✕
            </button>
          </div>

          <div
            style={{
              flex: 1,
              padding: 14,
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
              gap: 10,
              fontSize: 13,
            }}
          >
            {messages.map((m, idx) => (
              <div
                key={idx}
                style={{
                  alignSelf: m.sender === "user" ? "flex-end" : "flex-start",
                  background: m.sender === "user" ? "var(--ink)" : "var(--paper-deep)",
                  color: m.sender === "user" ? "var(--paper)" : "var(--ink)",
                  padding: "8px 12px",
                  borderRadius: 8,
                  maxWidth: "85%",
                  lineHeight: 1.4,
                }}
              >
                {m.text}
              </div>
            ))}
            {busy && (
              <div className="small muted" style={{ fontStyle: "italic" }}>
                Gemma 4 is thinking…
              </div>
            )}
          </div>

          <div
            style={{
              padding: "10px 14px",
              borderTop: "1px solid var(--line)",
              display: "flex",
              gap: 8,
              alignItems: "center",
              background: "var(--paper)",
            }}
          >
            <button
              type="button"
              className={`btn ${listening ? "btn-primary recording" : "btn-quiet"}`}
              style={{
                padding: "8px 12px",
                borderRadius: 999,
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
              onClick={toggleListen}
              disabled={busy}
            >
              🎙️ {listening ? "Listening…" : "Speak"}
            </button>

            <input
              type="text"
              placeholder={listening ? "Listening to your voice…" : "Or type here…"}
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSend(transcript);
              }}
              style={{
                flex: 1,
                padding: "8px 10px",
                borderRadius: 4,
                border: "1px solid var(--line-strong)",
                fontSize: 13,
              }}
            />

            <button
              type="button"
              className="btn btn-primary"
              style={{ padding: "8px 12px" }}
              onClick={() => handleSend(transcript)}
              disabled={!transcript.trim() || busy}
            >
              ➤
            </button>
          </div>
        </div>
      )}
    </>
  );
}
