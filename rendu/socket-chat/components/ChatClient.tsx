"use client";

import { useEffect, useRef, useState, useCallback } from "react";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface ConversationSummary {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
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
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [isLoadingConv, setIsLoadingConv] = useState(false);
  const [health, setHealth] = useState<HealthInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  const refreshConversations = useCallback(async () => {
    try {
      const res = await fetch("/api/conversations", { cache: "no-store" });
      const data = await res.json();
      setConversations(data.conversations || []);
      return data.conversations as ConversationSummary[];
    } catch {
      return [];
    }
  }, []);

  // Sante backend
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

  // Chargement initial : liste des conversations + ouverture de la plus recente
  useEffect(() => {
    (async () => {
      const convs = await refreshConversations();
      if (convs.length > 0) {
        loadConversation(convs[0].id);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function loadConversation(id: string) {
    setIsLoadingConv(true);
    setError(null);
    try {
      const res = await fetch(`/api/conversations/${id}`, { cache: "no-store" });
      if (!res.ok) throw new Error("Conversation introuvable.");
      const data = await res.json();
      setActiveId(id);
      setMessages(
        data.conversation.messages.map((m: { id: string; role: string; content: string }) => ({
          id: m.id,
          role: m.role,
          content: m.content,
        }))
      );
    } catch {
      setError("Impossible de charger cette conversation.");
    } finally {
      setIsLoadingConv(false);
    }
  }

  async function startNewConversation() {
    try {
      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Nouvelle conversation" }),
      });
      const data = await res.json();
      await refreshConversations();
      setActiveId(data.conversation.id);
      setMessages([]);
      setError(null);
    } catch {
      setError("Impossible de creer une nouvelle conversation.");
    }
  }

  async function deleteConversation(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm("Supprimer cette conversation ?")) return;
    try {
      await fetch(`/api/conversations/${id}`, { method: "DELETE" });
      const convs = await refreshConversations();
      if (activeId === id) {
        if (convs.length > 0) {
          loadConversation(convs[0].id);
        } else {
          setActiveId(null);
          setMessages([]);
        }
      }
    } catch {
      setError("Impossible de supprimer cette conversation.");
    }
  }

  async function sendMessage() {
    const text = input.trim();
    if (!text || isStreaming) return;

    setError(null);

    // Cree une conversation a la volee si aucune n'est active
    let convId = activeId;
    if (!convId) {
      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Nouvelle conversation" }),
      });
      const data = await res.json();
      convId = data.conversation.id;
      setActiveId(convId);
    }

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
          conversationId: convId,
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

      refreshConversations();
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

  function formatDate(iso: string) {
    const d = new Date(iso);
    return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
  }

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-bg text-text">
      {/* Overlay mobile quand la sidebar est ouverte */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-20 bg-black/50 md:hidden"
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 flex w-72 flex-col border-r border-border bg-surface-2 transition-transform duration-200 md:static md:z-auto md:w-64 md:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full md:w-0 md:overflow-hidden md:border-r-0"
        }`}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-4">
          <span className="font-mono text-xs uppercase tracking-wider text-muted">Conversations</span>
        </div>

        <div className="px-3 py-3">
          <button
            onClick={startNewConversation}
            className="w-full rounded-xl border border-jade/50 bg-jade/10 px-3 py-2 text-sm font-medium text-signal transition-colors hover:bg-jade/20"
          >
            + Nouvelle conversation
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-2 pb-3">
          {conversations.length === 0 && (
            <p className="px-2 py-4 text-center text-xs text-muted">Aucune conversation pour le moment.</p>
          )}
          {conversations.map((c) => (
            <div
              key={c.id}
              onClick={() => loadConversation(c.id)}
              className={`group mb-1 flex cursor-pointer items-center justify-between rounded-lg px-3 py-2.5 text-sm transition-colors ${
                activeId === c.id ? "bg-surface border border-jade/40" : "hover:bg-surface"
              }`}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-text">{c.title}</p>
                <p className="font-mono text-[10px] text-muted">{formatDate(c.updatedAt)}</p>
              </div>
              <button
                onClick={(e) => deleteConversation(c.id, e)}
                className="ml-2 shrink-0 rounded px-1.5 py-0.5 text-xs text-muted opacity-0 transition-opacity hover:text-amber group-hover:opacity-100"
                title="Supprimer"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
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
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen((v) => !v)}
              className="rounded-lg border border-border px-2 py-1 text-xs text-muted hover:bg-surface"
              title="Basculer la barre laterale"
            >
              ☰
            </button>
            <div className="flex items-baseline gap-2 sm:gap-3">
              <h1 className="text-base font-semibold tracking-tight sm:text-lg">SOCket Terminal</h1>
              <span className="hidden font-mono text-xs text-muted sm:inline">/ chat console</span>
            </div>
          </div>
          <div className="flex items-center gap-2 truncate rounded-full border border-border bg-surface px-3 py-1 font-mono text-[11px] text-muted">
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${health?.ok ? "bg-signal" : "bg-amber"}`} />
            <span className="truncate">{health ? health.baseUrl : "verification..."}</span>
          </div>
        </header>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
          <div className="mx-auto flex max-w-3xl flex-col gap-4">
            {isLoadingConv && (
              <p className="text-center font-mono text-xs text-muted">Chargement de la conversation...</p>
            )}

            {!isLoadingConv && messages.length === 0 && (
              <div className="mt-16 text-center">
                <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted">
                  console prete
                </p>
                <p className="mt-3 text-2xl font-semibold tracking-tight">
                  Pose ta question a Phi-3.5-Financial
                </p>
                <p className="mx-auto mt-2 max-w-md text-sm text-muted">
                  Analyse financiere, donnees de marche, explications de concepts —
                  la reponse s&apos;affiche en direct, token par token, et chaque
                  conversation est sauvegardee automatiquement.
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
        <div className="border-t border-border px-4 py-4 sm:px-6">
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
    </div>
  );
}
