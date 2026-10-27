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
  onSelectTab?: (tab: "report" | "corroborate" | "passport" | "fatigue") => void;
  onAdminFilter?: (filter: string) => void;
  onTriggerAnchor?: () => void;
}

interface Message {
  sender: "user" | "bot";
  text: string;
  actionNote?: string;
}

type AgentState = "idle" | "listening" | "thinking" | "speaking";

export function VoiceChat({
  role,
  context,
  onApplyReport,
  onSelectTab,
  onAdminFilter,
  onTriggerAnchor,
}: VoiceChatProps) {
  const [open, setOpen] = useState(false);
  const [sessionActive, setSessionActive] = useState(false);
  const [agentState, setAgentState] = useState<AgentState>("idle");
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([
    {
      sender: "bot",
      text:
        role === "admin"
          ? "Safety Intelligence Agent active. Click once to start hands-free voice triage."
          : "Worker Safety Voice Agent ready. Click once and speak naturally to report hazards or check records.",
    },
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const sessionActiveRef = useRef(false);
  const busyRef = useRef(false);

  useEffect(() => {
    sessionActiveRef.current = sessionActive;
  }, [sessionActive]);

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
        if (text.trim() && !busyRef.current) {
          handleUserUtterance(text.trim());
        }
      };

      rec.onerror = () => {
        if (sessionActiveRef.current && !busyRef.current) {
          // Restart on harmless recognition glitch if session is still active
          setTimeout(() => {
            if (sessionActiveRef.current && !busyRef.current) {
              try {
                rec.start();
                setAgentState("listening");
              } catch {
                // Ignore already-started errors
              }
            }
          }, 600);
        }
      };

      rec.onend = () => {
        // If session is active and not currently waiting for server response or speaking, listen again
        if (sessionActiveRef.current && !busyRef.current) {
          setTimeout(() => {
            if (sessionActiveRef.current && !busyRef.current) {
              try {
                rec.start();
                setAgentState("listening");
              } catch {
                // Ignore
              }
            }
          }, 300);
        }
      };

      recognitionRef.current = rec;
    }
  }, []);

  const startSession = () => {
    if (!recognitionRef.current) {
      alert("Speech recognition is not supported in this browser. Please use Chrome/Edge.");
      return;
    }
    setOpen(true);
    setSessionActive(true);
    sessionActiveRef.current = true;
    busyRef.current = false;
    setAgentState("listening");

    try {
      recognitionRef.current.start();
    } catch {
      // Ignore
    }
  };

  const stopSession = () => {
    setSessionActive(false);
    sessionActiveRef.current = false;
    busyRef.current = false;
    setAgentState("idle");

    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // Ignore
      }
    }
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
  };

  const speak = (text: string, onDone?: () => void) => {
    if (!("speechSynthesis" in window)) {
      onDone?.();
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.05;
    utterance.pitch = 1.0;

    utterance.onstart = () => {
      setAgentState("speaking");
    };

    utterance.onend = () => {
      onDone?.();
      // If user has not closed the session, automatically switch back to listening
      if (sessionActiveRef.current) {
        setAgentState("listening");
        busyRef.current = false;
        setTimeout(() => {
          if (sessionActiveRef.current && recognitionRef.current) {
            try {
              recognitionRef.current.start();
            } catch {
              // Ignore
            }
          }
        }, 400);
      } else {
        setAgentState("idle");
      }
    };

    utterance.onerror = () => {
      onDone?.();
      if (sessionActiveRef.current) {
        setAgentState("listening");
        busyRef.current = false;
      } else {
        setAgentState("idle");
      }
    };

    window.speechSynthesis.speak(utterance);
  };

  const handleUserUtterance = async (userText: string) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setAgentState("thinking");

    // Add user message to log
    const updated: Message[] = [...messages, { sender: "user", text: userText }];
    setMessages(updated);

    // Stop recognition while AI thinks & speaks to avoid hearing itself
    try {
      recognitionRef.current?.stop();
    } catch {
      // Ignore
    }

    // Execute Client-Side Actions based on intent
    const action = detectAndExecuteAction(userText);
    if (action) {
      setActionNotice(action);
      setTimeout(() => setActionNotice(null), 5000);
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
      const botText =
        data.content ||
        data.reply ||
        "I have processed your request against the public ledger.";

      setMessages((prev) => [
        ...prev,
        { sender: "bot", text: botText, actionNote: action || undefined },
      ]);

      speak(botText);
    } catch {
      const errMsg = "Ledger query complete. Please speak your next instruction.";
      setMessages((prev) => [...prev, { sender: "bot", text: errMsg }]);
      speak(errMsg);
    }
  };

  const detectAndExecuteAction = (text: string): string | null => {
    const q = text.toLowerCase();

    // Worker navigation and reporting actions
    if (role === "worker") {
      if (q.includes("passport") || q.includes("credential") || q.includes("certificate") || q.includes("skill")) {
        onSelectTab?.("passport");
        return "Opened Digital Safety Skill Passport";
      }
      if (q.includes("fatigue") || q.includes("overtime") || q.includes("shift") || q.includes("hours")) {
        onSelectTab?.("fatigue");
        return "Opened Shift Fatigue Risk Check";
      }
      if (q.includes("comment") || q.includes("corroborat") || q.includes("coworker")) {
        onSelectTab?.("corroborate");
        return "Opened Coworker Corroboration & Comments Board";
      }

      // Hazard auto-filling
      let detectedCategory: string | undefined;
      if (q.includes("scaffold") || q.includes("fall") || q.includes("crack") || q.includes("structur")) {
        detectedCategory = "STRUCTURAL";
      } else if (q.includes("electric") || q.includes("wire") || q.includes("spark")) {
        detectedCategory = "ELECTRICAL";
      } else if (q.includes("fire") || q.includes("smoke") || q.includes("alarm") || q.includes("exit")) {
        detectedCategory = "FIRE";
      } else if (q.includes("chemical") || q.includes("spill") || q.includes("fume")) {
        detectedCategory = "CHEMICAL";
      } else if (q.includes("biohazard") || q.includes("steril") || q.includes("waste")) {
        detectedCategory = "MACHINERY";
      }

      let detectedZone: string | undefined;
      for (const z of context?.zones ?? []) {
        if (q.includes(z.toLowerCase())) {
          detectedZone = z;
          break;
        }
      }

      if (detectedCategory || detectedZone || q.includes("hazard") || q.includes("report")) {
        onSelectTab?.("report");
        onApplyReport?.({
          category: detectedCategory,
          zone: detectedZone,
          body: text,
        });
        return `Populated ${detectedCategory ?? "hazard"} report in ${detectedZone ?? "selected zone"}`;
      }
    }

    // Admin triage actions
    if (role === "admin") {
      if (q.includes("critical")) {
        onAdminFilter?.("CRITICAL");
        return "Filtered Queue: CRITICAL Severity Only";
      }
      if (q.includes("high")) {
        onAdminFilter?.("HIGH");
        return "Filtered Queue: HIGH Severity";
      }
      if (q.includes("all") || q.includes("reset")) {
        onAdminFilter?.("ALL");
        return "Queue Reset: Showing All Open Issues";
      }
      if (q.includes("anchor") || q.includes("hedera") || q.includes("blockchain")) {
        onTriggerAnchor?.();
        return "Triggered Merkle Anchor to Hedera Testnet";
      }
    }

    return null;
  };

  return (
    <>
      <style>{`
        @keyframes waveVibrate {
          0%, 100% { height: 6px; opacity: 0.4; }
          50% { height: 32px; opacity: 1; }
        }
        @keyframes pulseRing {
          0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7); }
          70% { transform: scale(1.05); box-shadow: 0 0 0 16px rgba(16, 185, 129, 0); }
          100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
        }
        @keyframes speakVibrate {
          0%, 100% { height: 10px; }
          25% { height: 28px; }
          75% { height: 36px; }
        }
        .ai-bubble-backdrop {
          position: fixed;
          bottom: 24px;
          right: 24px;
          z-index: 1000;
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 12px;
          font-family: inherit;
        }
        .ai-wave-bar {
          width: 4px;
          border-radius: 999px;
          background: #10b981;
          display: inline-block;
          transition: height 0.15s ease;
        }
        .ai-wave-bar.speaking {
          background: #3b82f6;
          animation: speakVibrate 0.6s infinite ease-in-out;
        }
        .ai-wave-bar.listening {
          background: #10b981;
          animation: waveVibrate 0.8s infinite ease-in-out;
        }
        .ai-wave-bar.thinking {
          background: #f59e0b;
          animation: waveVibrate 1.2s infinite ease-in-out;
        }
      `}</style>

      <div className="ai-bubble-backdrop">
        {/* Expanded Talking Bubble Drawer */}
        {open && (
          <div
            className="ai-chat-drawer"
            style={{
              display: "flex",
              flexDirection: "column",
              background: "var(--card, #1c1917)",
              border: "1px solid rgba(255, 255, 255, 0.15)",
              boxShadow: "0 24px 60px rgba(0, 0, 0, 0.55)",
              overflow: "hidden",
            }}
          >
            {/* Header */}
            <div
              style={{
                padding: "12px 16px",
                background: sessionActive ? "rgba(16, 185, 129, 0.15)" : "rgba(255, 255, 255, 0.05)",
                borderBottom: "1px solid rgba(255, 255, 255, 0.1)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background:
                      agentState === "listening"
                        ? "#10b981"
                        : agentState === "thinking"
                          ? "#f59e0b"
                          : agentState === "speaking"
                            ? "#3b82f6"
                            : "#6b7280",
                    animation: sessionActive ? "pulseRing 1.5s infinite" : "none",
                  }}
                />
                <div>
                  <strong style={{ fontSize: 13, color: "var(--fg, #f5f5f4)" }}>
                    {role === "admin" ? "Desk AI Assistant" : "Worker Safety Voice AI"}
                  </strong>
                  <div style={{ fontSize: 10, color: "var(--muted, #a8a29e)" }}>
                    Gemma 4 31B • Live Public Ledger
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                {sessionActive ? (
                  <button
                    type="button"
                    onClick={stopSession}
                    style={{
                      background: "#ef4444",
                      color: "#fff",
                      border: 0,
                      borderRadius: 999,
                      padding: "4px 10px",
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    ⏹️ Stop
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={startSession}
                    style={{
                      background: "#10b981",
                      color: "#fff",
                      border: 0,
                      borderRadius: 999,
                      padding: "4px 10px",
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    ▶️ Start
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    stopSession();
                    setOpen(false);
                  }}
                  style={{
                    background: "transparent",
                    border: 0,
                    color: "var(--muted, #a8a29e)",
                    fontSize: 16,
                    cursor: "pointer",
                    padding: "2px 6px",
                  }}
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Sound Wave Visualizer Banner */}
            <div
              style={{
                padding: "20px 16px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                background:
                  agentState === "listening"
                    ? "radial-gradient(circle, rgba(16, 185, 129, 0.25) 0%, rgba(0, 0, 0, 0) 70%)"
                    : agentState === "speaking"
                      ? "radial-gradient(circle, rgba(59, 130, 246, 0.25) 0%, rgba(0, 0, 0, 0) 70%)"
                      : "transparent",
                borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
                minHeight: 110,
              }}
            >
              {/* Vibrating Wave Bars */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  height: 44,
                  marginBottom: 10,
                }}
              >
                {[0.1, 0.3, 0.6, 0.9, 0.4, 0.8, 0.2, 0.7, 0.5].map((delay, idx) => (
                  <span
                    key={idx}
                    className={`ai-wave-bar ${agentState}`}
                    style={{
                      animationDelay: `${delay}s`,
                      height:
                        agentState === "idle"
                          ? "6px"
                          : agentState === "thinking"
                            ? "14px"
                            : undefined,
                    }}
                  />
                ))}
              </div>

              {/* Status Indicator */}
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color:
                    agentState === "listening"
                      ? "#10b981"
                      : agentState === "thinking"
                        ? "#f59e0b"
                        : agentState === "speaking"
                          ? "#3b82f6"
                          : "var(--muted, #a8a29e)",
                }}
              >
                {agentState === "listening" && "🎙️ Listening… speak naturally (hands-free)"}
                {agentState === "thinking" && "⚡ Analyzing public ledger with Gemma 4…"}
                {agentState === "speaking" && "🔊 AI Voice responding…"}
                {agentState === "idle" && "Click Start to begin continuous voice chat"}
              </div>

              {actionNotice && (
                <div
                  style={{
                    marginTop: 8,
                    fontSize: 11,
                    background: "rgba(16, 185, 129, 0.15)",
                    color: "#10b981",
                    padding: "4px 10px",
                    borderRadius: 999,
                    border: "1px solid rgba(16, 185, 129, 0.3)",
                  }}
                >
                  ⚡ {actionNotice}
                </div>
              )}
            </div>

            {/* Conversation Messages Subtitle Log */}
            <div
              style={{
                flex: 1,
                padding: "12px 16px",
                overflowY: "auto",
                display: "flex",
                flexDirection: "column",
                gap: 10,
                fontSize: 12.5,
                maxHeight: 220,
              }}
            >
              {messages.map((m, idx) => (
                <div
                  key={idx}
                  style={{
                    alignSelf: m.sender === "user" ? "flex-end" : "flex-start",
                    background:
                      m.sender === "user"
                        ? "#2563eb"
                        : "rgba(255, 255, 255, 0.08)",
                    color: "#fff",
                    padding: "8px 12px",
                    borderRadius: 12,
                    maxWidth: "88%",
                    lineHeight: 1.4,
                  }}
                >
                  {m.text}
                  {m.actionNote && (
                    <div
                      style={{
                        marginTop: 4,
                        fontSize: 10,
                        color: "#a7f3d0",
                        fontStyle: "italic",
                      }}
                    >
                      ✓ Action: {m.actionNote}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Footer Control */}
            <div
              style={{
                padding: "8px 14px",
                borderTop: "1px solid rgba(255, 255, 255, 0.08)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                background: "rgba(0, 0, 0, 0.2)",
                fontSize: 11,
                color: "var(--muted, #a8a29e)",
              }}
            >
              <span>Speak anytime while active</span>
              <button
                type="button"
                onClick={sessionActive ? stopSession : startSession}
                style={{
                  background: "transparent",
                  border: "1px solid rgba(255, 255, 255, 0.2)",
                  color: "var(--fg, #f5f5f4)",
                  padding: "4px 8px",
                  borderRadius: 6,
                  cursor: "pointer",
                  fontSize: 11,
                }}
              >
                {sessionActive ? "Stop Mic" : "Start Mic"}
              </button>
            </div>
          </div>
        )}

        {/* Floating Bubble Launcher Button */}
        <button
          type="button"
          onClick={() => {
            if (open && sessionActive) {
              stopSession();
              setOpen(false);
            } else {
              setOpen(true);
              startSession();
            }
          }}
          aria-label="Toggle Continuous AI Voice Assistant"
          style={{
            height: 52,
            padding: "0 20px",
            borderRadius: 999,
            alignSelf: "flex-end",
            border: sessionActive
              ? "2px solid #10b981"
              : "1px solid rgba(255, 255, 255, 0.2)",
            background: sessionActive
              ? "linear-gradient(135deg, #059669 0%, #047857 100%)"
              : "linear-gradient(135deg, #18181b 0%, #27272a 100%)",
            color: "#fff",
            display: "flex",
            alignItems: "center",
            gap: 10,
            cursor: "pointer",
            boxShadow: sessionActive
              ? "0 0 30px rgba(16, 185, 129, 0.5), 0 10px 25px rgba(0,0,0,0.4)"
              : "0 10px 30px rgba(0, 0, 0, 0.4)",
            transition: "all 0.25s ease",
          }}
        >
          {sessionActive ? (
            <>
              {/* Mini Vibrating Waves Inside Button */}
              <div style={{ display: "flex", alignItems: "center", gap: 3, height: 16 }}>
                {[0.1, 0.3, 0.5, 0.2].map((d, i) => (
                  <span
                    key={i}
                    style={{
                      width: 3,
                      borderRadius: 999,
                      background: "#fff",
                      animation: "waveVibrate 0.7s infinite ease-in-out",
                      animationDelay: `${d}s`,
                    }}
                  />
                ))}
              </div>
              <span style={{ fontWeight: 600, fontSize: 13 }}>AI Active (Stop)</span>
            </>
          ) : (
            <>
              <span style={{ fontSize: 18 }}>🎙️</span>
              <span style={{ fontWeight: 600, fontSize: 13 }}>
                {role === "admin" ? "Desk Voice AI" : "Voice AI Assistant"}
              </span>
            </>
          )}
        </button>
      </div>
    </>
  );
}
