"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { IconMemory, IconPen, IconPlus, IconSearch, IconTrash } from "@/components/icons";

interface Memory {
  id: string;
  content: string;
  kind: string;
  source: string;
  createdAt: string;
}

const KIND_META: Record<string, { label: string; className: string }> = {
  preference: { label: "Preference", className: "text-ember-400 border-ember-500/40 bg-ember-500/10" },
  fact: { label: "Fact", className: "text-cyanic-500 border-cyanic-500/40 bg-cyanic-500/10" },
  workflow: { label: "Workflow", className: "text-violetish-500 border-violetish-500/40 bg-violetish-500/10" },
};

export default function MemoryClient() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [content, setContent] = useState("");
  const [kind, setKind] = useState("preference");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  const patchMemory = async (id: string, newContent: string) => {
    const res = await fetch(`/api/memory/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: newContent }),
    });
    if (res.ok) {
      setMemories((prev) =>
        prev.map((m) => (m.id === id ? { ...m, content: newContent } : m))
      );
    }
    setEditingId(null);
  };

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/memory");
      const data = await res.json();
      setMemories(data.memories ?? []);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const add = async () => {
    const c = content.trim();
    if (!c || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: c, kind }),
      });
      if (res.ok) {
        setContent("");
        await load();
      }
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setMemories((prev) => prev.filter((m) => m.id !== id));
    await fetch(`/api/memory/${id}`, { method: "DELETE" });
  };

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return memories;
    return memories.filter((m) => m.content.toLowerCase().includes(q));
  }, [memories, query]);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl px-5 py-8">
        <h1 className="font-display text-xl font-semibold tracking-tight text-mist-100">
          Long-term memory
        </h1>
        <p className="mt-1 text-[13px] text-mist-500">
          {memories.length === 0
            ? "Empty for now — nothing is invented, everything here was explicitly stored."
            : `${memories.length} ${memories.length === 1 ? "item" : "items"} retained across sessions.`}
        </p>

        {/* Add */}
        <div className="mt-5 flex flex-col gap-2 rounded-xl border border-ink-700 bg-ink-850 p-3 sm:flex-row">
          <input
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            placeholder="Store a preference, fact, or workflow…"
            className="flex-1 rounded-lg border border-ink-600 bg-ink-900 px-3 py-2 text-[13px] text-mist-100 placeholder:text-mist-500/70 focus:border-ember-500/60 focus:outline-none"
          />
          <div className="flex gap-2">
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value)}
              className="rounded-lg border border-ink-600 bg-ink-900 px-2.5 py-2 text-[12.5px] text-mist-300 focus:border-ember-500/60 focus:outline-none"
            >
              <option value="preference">Preference</option>
              <option value="fact">Fact</option>
              <option value="workflow">Workflow</option>
            </select>
            <button
              onClick={add}
              disabled={!content.trim() || busy}
              className="flex items-center gap-1.5 rounded-lg bg-ember-500 px-3.5 py-2 text-[12.5px] font-semibold text-ink-950 transition-colors hover:bg-ember-400 disabled:opacity-35"
            >
              <IconPlus size={13} /> Store
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="relative mt-4">
          <IconSearch
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-mist-500"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search memories…"
            className="w-full rounded-lg border border-ink-700 bg-ink-900/60 py-2 pl-9 pr-3 text-[13px] text-mist-100 placeholder:text-mist-500/70 focus:border-ember-500/60 focus:outline-none"
          />
        </div>

        {/* List */}
        <div className="mt-4 flex flex-col gap-2">
          {visible.length === 0 && (
            <div className="rounded-xl border border-dashed border-ink-700 px-6 py-10 text-center">
              <IconMemory size={22} className="mx-auto text-mist-500/60" />
              <p className="mt-3 text-[13px] text-mist-500">
                {query ? "No memories match your search." : "No memories stored yet."}
              </p>
              {!query && (
                <p className="mx-auto mt-1 max-w-sm text-[12px] leading-relaxed text-mist-500/80">
                  Say <span className="font-mono text-ember-400/90">“remember that …”</span> in
                  the console, or store one manually above.
                </p>
              )}
            </div>
          )}
          {visible.map((m) => {
            const meta = KIND_META[m.kind] ?? KIND_META.fact;
            return (
              <div
                key={m.id}
                className="group flex items-start gap-3 rounded-xl border border-ink-700 bg-ink-850/80 px-4 py-3 transition-colors hover:border-ink-500"
              >
                <div className="min-w-0 flex-1">
                  {editingId === m.id ? (
                    <div className="flex flex-col gap-2">
                      <textarea
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        rows={2}
                        autoFocus
                        className="w-full resize-none rounded-lg border border-ember-500/50 bg-ink-900 px-3 py-2 text-[13px] leading-relaxed text-mist-100 focus:outline-none"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => patchMemory(m.id, editText.trim())}
                          disabled={!editText.trim()}
                          className="rounded-md bg-ember-500 px-3 py-1 text-[11.5px] font-semibold text-ink-950 hover:bg-ember-400 disabled:opacity-35"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="rounded-md border border-ink-600 px-3 py-1 text-[11.5px] font-semibold text-mist-500 hover:text-mist-300"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-[13.5px] leading-relaxed text-mist-100">{m.content}</p>
                  )}
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <span className={`rounded border px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide ${meta.className}`}>
                      {meta.label}
                    </span>
                    {m.source === "assistant" && (
                      <span className="rounded border border-violetish-500/40 bg-violetish-500/10 px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide text-violetish-500">
                        Via console
                      </span>
                    )}
                    <span className="text-[10.5px] text-mist-500">
                      {new Date(m.createdAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                  </div>
                </div>
                <div className="mt-0.5 hidden shrink-0 items-center gap-0.5 group-hover:flex">
                  <button
                    onClick={() => {
                      setEditingId(m.id);
                      setEditText(m.content);
                    }}
                    className="rounded p-1.5 text-mist-500 hover:bg-ember-500/15 hover:text-ember-400"
                    title="Edit memory"
                  >
                    <IconPen size={14} />
                  </button>
                  <button
                    onClick={() => remove(m.id)}
                    className="rounded p-1.5 text-mist-500 hover:bg-danger-500/15 hover:text-danger-500"
                    title="Forget this memory"
                  >
                    <IconTrash size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-6 rounded-lg border border-ink-700 bg-ink-850/60 px-4 py-3 text-[12px] leading-relaxed text-mist-500">
          <strong className="text-mist-300">Memory policy:</strong> nothing is inferred from
          behavior alone, nothing is invented, and <em>forget</em> always works — say{" "}
          <span className="font-mono text-ember-400/90">“forget everything”</span> in the console.
          Hover any memory to <strong>edit</strong> ✏️ it, search above, or ask the console{" "}
          <span className="font-mono text-ember-400/90">“show memories about &lt;topic&gt;”</span>.
          The brain also sees your last 40 exchanges of every conversation.
        </div>
      </div>
    </div>
  );
}
