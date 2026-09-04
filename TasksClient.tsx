"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { IconPlus, IconTasks, IconTrash } from "@/components/icons";
import { PRIORITY_META } from "@/lib/format";

interface Task {
  id: string;
  title: string;
  priority: string;
  status: string;
  source: string;
  createdAt: string;
}

const COLUMNS: { key: string; title: string; hint: string }[] = [
  { key: "todo", title: "Queued", hint: "Ready to start" },
  { key: "doing", title: "In motion", hint: "Actively working" },
  { key: "done", title: "Shipped", hint: "Verified & closed" },
];

export default function TasksClient() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [newTitle, setNewTitle] = useState("");
  const [newPriority, setNewPriority] = useState("medium");
  const [filter, setFilter] = useState("all");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/tasks");
      const data = await res.json();
      setTasks(data.tasks ?? []);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const addTask = async () => {
    const title = newTitle.trim();
    if (!title || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, priority: newPriority }),
      });
      if (res.ok) {
        setNewTitle("");
        await load();
      }
    } finally {
      setBusy(false);
    }
  };

  const patch = async (id: string, body: Record<string, string>) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...body } : t)));
    await fetch(`/api/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  };

  const remove = async (id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    await fetch(`/api/tasks/${id}`, { method: "DELETE" });
  };

  const visible = useMemo(
    () => (filter === "all" ? tasks : tasks.filter((t) => t.priority === filter)),
    [tasks, filter]
  );

  const counts = {
    total: tasks.length,
    open: tasks.filter((t) => t.status !== "done").length,
    done: tasks.filter((t) => t.status === "done").length,
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-5xl px-5 py-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-xl font-semibold tracking-tight text-mist-100">
              Task execution
            </h1>
            <p className="mt-1 text-[13px] text-mist-500">
              {counts.open} open · {counts.done} shipped — goals become work items here.
            </p>
          </div>
          <div className="flex gap-1 rounded-lg border border-ink-700 bg-ink-850 p-1">
            {["all", "high", "medium", "low"].map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded-md px-2.5 py-1 text-[11.5px] font-semibold capitalize transition-colors ${
                  filter === f
                    ? "bg-ember-500/15 text-ember-300"
                    : "text-mist-500 hover:text-mist-300"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* Composer */}
        <div className="mt-5 flex flex-col gap-2 rounded-xl border border-ink-700 bg-ink-850 p-3 sm:flex-row">
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addTask()}
            placeholder="Add a task… (or tell the console: “add task …”)"
            className="flex-1 rounded-lg border border-ink-600 bg-ink-900 px-3 py-2 text-[13px] text-mist-100 placeholder:text-mist-500/70 focus:border-ember-500/60 focus:outline-none"
          />
          <div className="flex gap-2">
            <select
              value={newPriority}
              onChange={(e) => setNewPriority(e.target.value)}
              className="rounded-lg border border-ink-600 bg-ink-900 px-2.5 py-2 text-[12.5px] text-mist-300 focus:border-ember-500/60 focus:outline-none"
            >
              <option value="high">High priority</option>
              <option value="medium">Medium priority</option>
              <option value="low">Low priority</option>
            </select>
            <button
              onClick={addTask}
              disabled={!newTitle.trim() || busy}
              className="flex items-center gap-1.5 rounded-lg bg-ember-500 px-3.5 py-2 text-[12.5px] font-semibold text-ink-950 transition-colors hover:bg-ember-400 disabled:opacity-35"
            >
              <IconPlus size={13} /> Add
            </button>
          </div>
        </div>

        {/* Board */}
        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
          {COLUMNS.map((col) => {
            const colTasks = visible.filter((t) => t.status === col.key);
            return (
              <div key={col.key} className="rounded-xl border border-ink-700 bg-ink-900/50">
                <div className="flex items-center justify-between border-b border-ink-700/70 px-4 py-3">
                  <div>
                    <div className="font-display text-[13px] font-semibold text-mist-100">
                      {col.title}
                    </div>
                    <div className="text-[10.5px] text-mist-500">{col.hint}</div>
                  </div>
                  <span className="rounded-md border border-ink-600 bg-ink-800 px-2 py-0.5 text-[11px] font-semibold text-mist-300">
                    {colTasks.length}
                  </span>
                </div>
                <div className="flex flex-col gap-2 p-3">
                  {colTasks.length === 0 && (
                    <div className="rounded-lg border border-dashed border-ink-700 px-3 py-5 text-center text-[11.5px] text-mist-500/70">
                      Nothing here
                    </div>
                  )}
                  {colTasks.map((t) => {
                    const prio = PRIORITY_META[t.priority] ?? PRIORITY_META.medium;
                    return (
                      <div
                        key={t.id}
                        className="group rounded-lg border border-ink-700 bg-ink-850 p-3 transition-colors hover:border-ink-500"
                      >
                        <div className="flex items-start gap-2">
                          <button
                            onClick={() =>
                              patch(t.id, { status: t.status === "done" ? "todo" : "done" })
                            }
                            title={t.status === "done" ? "Reopen" : "Mark shipped"}
                            className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                              t.status === "done"
                                ? "border-sage-500 bg-sage-500 text-ink-950"
                                : "border-ink-500 hover:border-ember-500"
                            }`}
                          >
                            {t.status === "done" && (
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                <path d="m5 13 4 4L19 7" />
                              </svg>
                            )}
                          </button>
                          <div className="min-w-0 flex-1">
                            <p
                              className={`text-[13px] leading-snug ${
                                t.status === "done"
                                  ? "text-mist-500 line-through decoration-ink-500"
                                  : "text-mist-100"
                              }`}
                            >
                              {t.title}
                            </p>
                            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                              <span className={`rounded border px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide ${prio.className}`}>
                                {prio.label}
                              </span>
                              {t.source === "assistant" && (
                                <span className="rounded border border-violetish-500/40 bg-violetish-500/10 px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide text-violetish-500">
                                  AI
                                </span>
                              )}
                            </div>
                          </div>
                          <button
                            onClick={() => remove(t.id)}
                            className="hidden shrink-0 rounded p-1 text-mist-500 hover:bg-danger-500/15 hover:text-danger-500 group-hover:block"
                            title="Delete task"
                          >
                            <IconTrash size={13} />
                          </button>
                        </div>
                        <div className="mt-2 flex gap-1.5">
                          {COLUMNS.filter((c) => c.key !== t.status).map((c) => (
                            <button
                              key={c.key}
                              onClick={() => patch(t.id, { status: c.key })}
                              className="rounded border border-ink-600 px-2 py-0.5 text-[10px] font-medium text-mist-500 transition-colors hover:border-ember-500/50 hover:text-ember-300"
                            >
                              → {c.title}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-6 flex items-center gap-2 rounded-lg border border-ink-700 bg-ink-850/60 px-4 py-3 text-[12px] text-mist-500">
          <IconTasks size={14} className="shrink-0 text-ember-500" />
          Tip: the console can add tasks for you — try “add task Review quarterly goals” or ask it to plan something.
        </div>
      </div>
    </div>
  );
}
