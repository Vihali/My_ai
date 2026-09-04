"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Markdown from "@/components/Markdown";
import {
  IconChat,
  IconPlus,
  IconSend,
  IconSpark,
  IconTrash,
  LogoMark,
} from "@/components/icons";
import type { AssistantMode } from "@/lib/assistant";
import { timeAgo } from "@/lib/format";

interface Artifact {
  title: string;
  html: string;
}

interface Msg {
  id: string;
  role: "user" | "assistant";
  content: string;
  mode?: AssistantMode;
  actions?: { type: string; label: string }[];
  followUps?: string[];
  artifact?: Artifact;
  streaming?: boolean;
}

function ArtifactPreview({ artifact }: { artifact: Artifact }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const fullscreen = () => {
    wrapRef.current?.requestFullscreen?.();
  };

  const download = () => {
    const blob = new Blob([artifact.html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = artifact.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40) + ".html";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="anim-rise mt-2">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-violetish-500/40 bg-violetish-500/10 px-3 py-2.5">
        <span className="text-[16px]" aria-hidden>
          🎮
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12.5px] font-semibold text-mist-100">
            {artifact.title}
          </div>
          <div className="text-[10.5px] text-mist-500">
            Built by Vishal.AI — runs right here
          </div>
        </div>
        <button
          onClick={() => setOpen((v) => !v)}
          className={`rounded-lg px-3 py-1.5 text-[12px] font-semibold transition-colors ${
            open
              ? "border border-ink-600 bg-ink-800 text-mist-300 hover:text-mist-100"
              : "bg-violetish-500 text-ink-950 hover:opacity-90"
          }`}
        >
          {open ? "Close" : "▶ Run it"}
        </button>
        {open && (
          <>
            <button
              onClick={fullscreen}
              className="rounded-lg border border-ink-600 bg-ink-800 px-2.5 py-1.5 text-[12px] font-semibold text-mist-300 hover:text-mist-100"
              title="Fullscreen"
            >
              ⛶
            </button>
            <button
              onClick={download}
              className="rounded-lg border border-ink-600 bg-ink-800 px-2.5 py-1.5 text-[12px] font-semibold text-mist-300 hover:text-mist-100"
              title="Download as .html"
            >
              ⬇
            </button>
          </>
        )}
      </div>
      {open && (
        <div
          ref={wrapRef}
          className="mt-2 overflow-hidden rounded-xl border border-ink-600 bg-white fullscreen:h-full fullscreen:w-full fullscreen:rounded-none"
        >
          <iframe
            title={artifact.title}
            sandbox="allow-scripts allow-pointer-lock"
            srcDoc={artifact.html}
            className="h-[440px] w-full bg-white fullscreen:h-full"
          />
        </div>
      )}
      {open && (
        <p className="mt-1 text-[10.5px] text-mist-500">
          Tip: click inside the preview so it captures your keyboard controls.
        </p>
      )}
    </div>
  );
}

interface ConvSummary {
  id: string;
  title: string;
  updatedAt: string;
}

const QUICK_ACTIONS = [
  { label: "💛 Say hi", text: "Hi" },
  { label: "🎮 Make a game", text: "Make me a snake game — fully playable, with score and restart" },
  { label: "⚡ Calculate", text: "20% of 150" },
  { label: "✍️ Draft email", text: "Draft an email to Alex about moving the deadline to Friday" },
  { label: "🗂️ Plan project", text: "Plan my product launch" },
  { label: "💡 Brainstorm", text: "Ideas for a study-focus app" },
  { label: "🧠 Remember", text: "Remember that " },
];

const STARTERS = [
  { title: "Run the numbers", desc: "Math, percentages & unit conversions with shown work.", prompt: "(128 × 4) − 15% of 200" },
  { title: "Draft a message", desc: "Professional, friendly and short versions at once.", prompt: "Draft an email to Sam about rescheduling our review to Thursday" },
  { title: "Plan something real", desc: "Goal → milestones → risks → next action.", prompt: "Plan my freelance portfolio launch" },
  { title: "Just say hi", desc: "A human hello, encouragement, and a real “how are you?”", prompt: "Hi" },
];

function TypingIndicator() {
  return (
    <div className="anim-rise flex items-center gap-2 px-1 py-2">
      <span className="text-ember-500">
        <LogoMark size={16} />
      </span>
      <div className="flex gap-1">
        <span className="typing-dot h-1.5 w-1.5 rounded-full bg-ember-500" />
        <span className="typing-dot h-1.5 w-1.5 rounded-full bg-ember-500" />
        <span className="typing-dot h-1.5 w-1.5 rounded-full bg-ember-500" />
      </div>
      <span className="text-[11px] text-mist-500">thinking…</span>
    </div>
  );
}

export default function ChatClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeId = searchParams.get("c");

  const [conversations, setConversations] = useState<ConvSummary[]>([]);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const streamTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadConversations = useCallback(async () => {
    try {
      const res = await fetch("/api/conversations");
      const data = await res.json();
      setConversations(data.conversations ?? []);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  // Load conversation when activeId changes
  useEffect(() => {
    if (streamTimer.current) {
      clearInterval(streamTimer.current);
      streamTimer.current = null;
    }
    if (!activeId) {
      setMessages([]);
      setLoaded(true);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/conversations/${activeId}`);
        if (!res.ok) {
          setMessages([]);
          return;
        }
        const data = await res.json();
        if (cancelled) return;
        setMessages(
          (data.messages ?? []).map((m: { id: string; role: "user" | "assistant"; content: string; mode?: AssistantMode; meta?: { actions?: { type: string; label: string }[]; followUps?: string[]; artifact?: Artifact } }) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            mode: m.mode ?? undefined,
            actions: m.meta?.actions,
            followUps: m.meta?.followUps,
            artifact: m.meta?.artifact,
          }))
        );
      } catch {
        if (!cancelled) setMessages([]);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeId]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, pending]);

  const streamContent = useCallback((full: string, msgId: string) => {
    let i = 0;
    if (streamTimer.current) clearInterval(streamTimer.current);
    streamTimer.current = setInterval(() => {
      i = Math.min(full.length, i + 3 + Math.floor(Math.random() * 5));
      const slice = full.slice(0, i);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msgId ? { ...m, content: slice, streaming: i < full.length } : m
        )
      );
      if (i >= full.length && streamTimer.current) {
        clearInterval(streamTimer.current);
        streamTimer.current = null;
      }
    }, 12);
  }, []);

  const send = useCallback(
    async (raw?: string) => {
      const text = (raw ?? input).trim();
      if (!text || pending) return;
      setError(null);
      setPending(true);
      setInput("");

      const userMsg: Msg = {
        id: `u-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        role: "user",
        content: text,
      };
      setMessages((prev) => [...prev, userMsg]);

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: text, conversationId: activeId ?? undefined }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error ?? "Request failed");

        if (data.conversationId !== activeId) {
          router.replace(`/chat?c=${data.conversationId}`);
        }
        loadConversations();

        const aMsg: Msg = {
          id: data.assistant.id,
          role: "assistant",
          content: "",
          mode: data.assistant.mode,
          actions: data.assistant.actions,
          followUps: data.assistant.followUps,
          artifact: data.assistant.artifact ?? undefined,
          streaming: true,
        };
        setMessages((prev) => [...prev, aMsg]);
        setPending(false);
        streamContent(data.assistant.content, data.assistant.id);
      } catch (e) {
        setPending(false);
        setError(e instanceof Error ? e.message : "Something went wrong");
        setMessages((prev) => prev.filter((m) => m.id !== userMsg.id));
        setInput(text);
      }
    },
    [input, pending, activeId, router, loadConversations, streamContent]
  );

  const newSession = useCallback(() => {
    if (streamTimer.current) {
      clearInterval(streamTimer.current);
      streamTimer.current = null;
    }
    setMessages([]);
    router.replace("/chat");
    composerRef.current?.focus();
  }, [router]);

  const removeConversation = useCallback(
    async (id: string) => {
      await fetch(`/api/conversations/${id}`, { method: "DELETE" });
      if (id === activeId) newSession();
      loadConversations();
    },
    [activeId, newSession, loadConversations]
  );

  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
  const isStreaming = messages.some((m) => m.streaming);

  return (
    <div className="flex h-full">
      {/* Conversation sidebar */}
      <div className="flex w-60 shrink-0 flex-col border-r border-ink-700/70 bg-ink-900/40 max-lg:hidden">
        <div className="p-3">
          <button
            onClick={newSession}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-ember-500/40 bg-ember-500/10 px-3 py-2 text-[13px] font-semibold text-ember-300 transition-colors hover:bg-ember-500/20"
          >
            <IconPlus size={14} />
            New session
          </button>
        </div>
        <div className="px-4 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-mist-500">
          Sessions
        </div>
        <div className="flex-1 overflow-y-auto px-2 pb-3">
          {conversations.length === 0 && (
            <p className="px-3 py-4 text-[12px] leading-relaxed text-mist-500">
              No sessions yet. Your conversations will appear here.
            </p>
          )}
          {conversations.map((c) => (
            <div
              key={c.id}
              className={`group relative mb-0.5 flex cursor-pointer items-start gap-2 rounded-lg px-3 py-2 transition-colors ${
                c.id === activeId
                  ? "bg-ink-700/60"
                  : "hover:bg-ink-800/80"
              }`}
              onClick={() => router.replace(`/chat?c=${c.id}`)}
            >
              <span className={`mt-0.5 ${c.id === activeId ? "text-ember-500" : "text-mist-500"}`}>
                <IconChat size={13} />
              </span>
              <div className="min-w-0 flex-1">
                <div
                  className={`truncate text-[12.5px] font-medium ${
                    c.id === activeId ? "text-mist-100" : "text-mist-300"
                  }`}
                >
                  {c.title}
                </div>
                <div className="text-[10.5px] text-mist-500">{timeAgo(c.updatedAt)}</div>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  removeConversation(c.id);
                }}
                className="mt-0.5 hidden rounded p-1 text-mist-500 hover:bg-danger-500/15 hover:text-danger-500 group-hover:block"
                title="Delete session"
              >
                <IconTrash size={12} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Message column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-3xl px-4 py-6">
            {messages.length === 0 && loaded ? (
              <div className="flex flex-col items-center pt-14 text-center">
                <span className="text-ember-500">
                  <LogoMark size={44} />
                </span>
                <h1 className="mt-5 font-display text-2xl font-semibold tracking-tight text-mist-100">
                  Think better. Create better. Get things done.
                </h1>
                <p className="mt-2 max-w-md text-[13.5px] leading-relaxed text-mist-500">
                  One companion, many capabilities — memory, tasks, math, plans,
                  decisions, and honest conversation. English or বাংলা, as you like.
                </p>
                <div className="mt-8 grid w-full max-w-2xl grid-cols-1 gap-2.5 sm:grid-cols-2">
                  {STARTERS.map((s) => (
                    <button
                      key={s.title}
                      onClick={() => send(s.prompt)}
                      className="group rounded-xl border border-ink-700 bg-ink-850/80 p-4 text-left transition-all hover:-translate-y-0.5 hover:border-ember-500/50 hover:bg-ink-800"
                    >
                      <div className="flex items-center gap-2 font-display text-[13.5px] font-semibold text-mist-100">
                        <IconSpark size={14} className="text-ember-500" />
                        {s.title}
                      </div>
                      <p className="mt-1 text-[12px] leading-relaxed text-mist-500">{s.desc}</p>
                      <p className="mt-2 truncate font-mono text-[11px] text-ember-400/80">
                        {s.prompt}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-5">
                {messages.map((m) =>
                  m.role === "user" ? (
                    <div key={m.id} className="anim-rise flex justify-end">
                      <div className="max-w-[85%] rounded-2xl rounded-br-md border border-ember-500/25 bg-ember-500/10 px-4 py-2.5 text-[13.5px] leading-relaxed text-mist-100">
                        {m.content}
                      </div>
                    </div>
                  ) : (
                    <div key={m.id} className="anim-rise flex gap-3">
                      <div className="mt-1 shrink-0 text-ember-500">
                        <LogoMark size={18} />
                      </div>
                      <div className="min-w-0 flex-1">
                        {(m.actions?.length ?? 0) > 0 && (
                          <div className="mb-1.5 flex flex-wrap items-center gap-2">
                            {(m.actions ?? []).map((a, i) => (
                              <span
                                key={i}
                                className="inline-flex items-center gap-1 rounded-md border border-sage-500/40 bg-sage-500/10 px-2 py-0.5 text-[10.5px] font-semibold text-sage-500"
                              >
                                ✓ {a.label}
                              </span>
                            ))}
                          </div>
                        )}
                        <div className="rounded-2xl rounded-tl-md border border-ink-700 bg-ink-850/90 px-4 py-3">
                          <Markdown content={m.content} streaming={m.streaming} />
                        </div>
                        {!m.streaming && m.artifact && <ArtifactPreview artifact={m.artifact} />}
                        {!m.streaming && m.id === lastAssistant?.id && (m.followUps?.length ?? 0) > 0 && !pending && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {(m.followUps ?? []).map((f, i) => (
                              <button
                                key={i}
                                onClick={() => send(f)}
                                className="rounded-full border border-ink-600 bg-ink-800/70 px-3 py-1 text-[11.5px] text-mist-300 transition-colors hover:border-ember-500/50 hover:text-ember-300"
                              >
                                {f}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                )}
                {pending && <TypingIndicator />}
              </div>
            )}
          </div>
        </div>

        {/* Composer */}
        <div className="border-t border-ink-700/70 bg-ink-900/70 px-4 pb-4 pt-3">
          <div className="mx-auto w-full max-w-3xl">
            <div className="mb-2 flex flex-wrap gap-1.5">
              {QUICK_ACTIONS.map((qa) => (
                <button
                  key={qa.label}
                  onClick={() => {
                    setInput(qa.text);
                    composerRef.current?.focus();
                  }}
                  className="rounded-md border border-ink-600 bg-ink-800/60 px-2.5 py-1 text-[11px] font-medium text-mist-500 transition-colors hover:border-ink-500 hover:text-mist-300"
                >
                  {qa.label}
                </button>
              ))}
            </div>
            {error && (
              <div className="mb-2 rounded-lg border border-danger-500/40 bg-danger-500/10 px-3 py-2 text-[12px] text-danger-500">
                {error}
              </div>
            )}
            <div className="flex items-end gap-2 rounded-xl border border-ink-600 bg-ink-850 p-2 transition-colors focus-within:border-ember-500/60">
              <textarea
                ref={composerRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                rows={Math.min(5, Math.max(1, input.split("\n").length))}
                placeholder="Ask, compute, plan, or say “remember that…”  ·  Enter to send"
                className="max-h-40 flex-1 resize-none bg-transparent px-2 py-1.5 text-[13.5px] leading-relaxed text-mist-100 placeholder:text-mist-500/70 focus:outline-none"
              />
              <button
                onClick={() => send()}
                disabled={!input.trim() || pending}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-ember-500 text-ink-950 transition-all hover:bg-ember-400 disabled:cursor-not-allowed disabled:opacity-35"
                title="Send"
              >
                <IconSend size={16} />
              </button>
            </div>
            <p className="mt-1.5 text-center text-[10.5px] text-mist-500/80">
              Local reasoning core — results are computed, never fabricated. No live web search in this build.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
