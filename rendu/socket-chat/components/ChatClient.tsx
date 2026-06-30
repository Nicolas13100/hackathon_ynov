"use client";

import { useEffect, useRef, useState } from "react";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface HealthInfo {
  ok: boolean;
  type: string;
  baseUrl: string;
  model: string;
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

export default function ChatClient() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [health, setHealth] = useState<HealthInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    async function ping() {
      try {
        const res = await fetch("/api/health", { cache: "no-store" });
        const data: HealthInfo = await res.json();
        if (!cancelled) setHealth(data);
      } catch {
        if (!cancelled) setHealth({ ok: false, type: "?", baseUrl: "?", model: "?" });
      }
    }
    ping();
    const interval = setInterval(ping, 15000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function sendMessage() {
    const text = input.trim();
    if (!text || isStreaming) return;

    setError(null);
    const userMsg: Message = { id: uid(), role: "user", content: text };
    const assistantId = uid();
    const history = [...messages, userMsg];

    setMessages([...history, { id: assistantId, role: "assistant", content: "" }]);
    setInput("");
    setIsStreaming(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history.map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Erreur serveur (${res.status})`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, content: m.content + chunk } : m))
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erreur inconnue.";
      setError(msg);
      setMessages((prev) => prev.filter((m) => m.id !== assistantId));
    } finally {
      setIsStreaming(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  return (
    <div className="flex h-dvh flex-col bg-bg text-text">
      {/* Bandeau ticker - statut du backend */}
      <div className="relative overflow-hidden border-b border-border bg-surface-2 py-1.5">
        <div className="flex w-max ticker-track">
          {[0, 1].map((rep) => (
            <div key={rep} className="flex items-center gap-8 px-4 font-mono text-[11px] tracking-wide text-muted">
              {Array.from({ length: 6 }).map((_, i) => (
                <span key={i} className="flex items-center gap-2 whitespace-nowrap">
                  <span
                    className={`live-dot inline-block h-1.5 w-1.5 rounded-full ${
                      health?.ok ? "bg-signal" : "bg-amber"
                    }`}
                  />
                  PHI-3.5-FINANCIAL
                  <span className="text-border">·</span>
                  BACKEND: {(health?.type || "...").toUpperCase()}
                  <span className="text-border">·</span>
                  {health?.ok ? "LIEN ACTIF" : "EN ATTENTE DE CONNEXION"}
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Header */}
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="flex items-baseline gap-3">
          <h1 className="text-lg font-semibold tracking-tight">SOCket Terminal</h1>
          <span className="font-mono text-xs text-muted">/ chat console</span>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 font-mono text-[11px] text-muted">
          <span className={`h-1.5 w-1.5 rounded-full ${health?.ok ? "bg-signal" : "bg-amber"}`} />
          {health ? health.baseUrl : "verification..."}
        </div>
      </header>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto flex max-w-3xl flex-col gap-4">
          {messages.length === 0 && (
            <div className="mt-16 text-center">
              <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted">
                console prete
              </p>
              <p className="mt-3 text-2xl font-semibold tracking-tight">
                Pose ta question a Phi-3.5-Financial
              </p>
              <p className="mx-auto mt-2 max-w-md text-sm text-muted">
                Analyse financiere, donnees de marche, explications de concepts —
                la reponse s&apos;affiche en direct, token par token.
              </p>
            </div>
          )}

          {messages.map((m) => (
            <div
              key={m.id}
              className={`msg-enter flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  m.role === "user"
                    ? "bg-user-bubble border border-jade/40"
                    : "bg-surface border border-border"
                }`}
              >
                <div className="mb-1 font-mono text-[10px] uppercase tracking-wider text-muted">
                  {m.role === "user" ? "toi" : "phi-3.5-financial"}
                </div>
                <div className="whitespace-pre-wrap">
                  {m.content || (isStreaming && m.role === "assistant" ? "▍" : "")}
                </div>
              </div>
            </div>
          ))}

          {error && (
            <div className="msg-enter rounded-xl border border-amber/40 bg-amber/10 px-4 py-3 text-sm text-amber">
              <span className="font-mono text-[10px] uppercase tracking-wider">erreur</span>
              <div className="mt-1">{error}</div>
            </div>
          )}
        </div>
      </div>

      {/* Input */}
      <div className="border-t border-border px-6 py-4">
        <div className="mx-auto flex max-w-3xl items-end gap-3">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ecris ton message... (Entree pour envoyer, Maj+Entree pour une ligne)"
            rows={1}
            className="max-h-40 flex-1 resize-none rounded-xl border border-border bg-surface px-4 py-3 text-sm text-text placeholder:text-muted focus:border-jade focus:outline-none"
          />
          <button
            onClick={sendMessage}
            disabled={isStreaming || !input.trim()}
            className="rounded-xl bg-jade px-5 py-3 text-sm font-medium text-text transition-colors hover:bg-jade/80 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isStreaming ? "..." : "Envoyer"}
          </button>
        </div>
      </div>
    </div>
  );
}
