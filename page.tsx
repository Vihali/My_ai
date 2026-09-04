import Link from "next/link";
import { desc, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { conversations, memories, messages, tasks } from "@/db/schema";
import AppShell from "@/components/AppShell";
import InstallPWA from "@/components/InstallPWA";
import { IconArrowRight, IconBolt, IconGear, LogoMark } from "@/components/icons";
import { greetingForNow, timeAgo } from "@/lib/format";
import { getLLMConfig } from "@/lib/llm";

export const dynamic = "force-dynamic";

const CAPABILITIES = [
  { emoji: "💛", title: "Real conversation", blurb: "Warmth, humor, honesty — one consistent companion" },
  { emoji: "🧮", title: "Numbers that check out", blurb: "Math, percentages & unit conversions with shown work" },
  { emoji: "🗂️", title: "Things actually done", blurb: "Tasks, plans & milestones — persisted across sessions" },
  { emoji: "🧠", title: "Memory you control", blurb: "Store and forget explicitly; nothing silently inferred" },
  { emoji: "✍️", title: "Words on demand", blurb: "Emails and drafts in the tone the moment needs" },
  { emoji: "🤝", title: "Decisions, coached", blurb: "Trade-offs, gut-checks, and an honest read" },
  { emoji: "💻", title: "Code inspection", blurb: "Structure, balance & smell checks on pasted code" },
  { emoji: "📈", title: "Text insight", blurb: "Word stats, reading time & readability signals" },
  { emoji: "🎮", title: "Build & run live", blurb: "Games & websites that run right inside the chat" },
  { emoji: "🧰", title: "Pocket tools", blurb: "Passwords, dice, coin flips, UUIDs & date math" },
];

export default async function DashboardPage() {
  const [convCount] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(conversations);
  const [msgCount] = await db.select({ n: sql<number>`count(*)::int` }).from(messages);
  const [memCount] = await db.select({ n: sql<number>`count(*)::int` }).from(memories);
  const [openTaskCount] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(tasks)
    .where(isNull(tasks.completedAt));

  const recent = await db
    .select()
    .from(conversations)
    .orderBy(desc(conversations.updatedAt))
    .limit(4);

  const brain = await getLLMConfig();

  const stats = [
    { label: "Sessions", value: convCount.n },
    { label: "Exchanges", value: msgCount.n },
    { label: "Open tasks", value: openTaskCount.n },
    { label: "Memories", value: memCount.n },
  ];

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <AppShell>
      <div className="h-full overflow-y-auto">
        <div className="mx-auto w-full max-w-5xl px-5 py-8">
          {/* Header */}
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-mist-500">
                {today}
              </div>
              <h1 className="mt-1.5 font-display text-2xl font-semibold tracking-tight text-mist-100">
                {greetingForNow()}. The system is ready.
              </h1>
              <p className="mt-1.5 max-w-lg text-[13.5px] leading-relaxed text-mist-500">
                Think better, create better, learn faster. One console with persistent
                memory and task execution — computed results only, zero fabrication.
              </p>
            </div>
            <Link
              href="/chat"
              className="flex items-center gap-2 rounded-lg bg-ember-500 px-4 py-2.5 text-[13px] font-semibold text-ink-950 transition-colors hover:bg-ember-400"
            >
              <IconBolt size={14} />
              Open console
            </Link>
          </div>

          {/* Permanent deploy helper */}
          <div className="mt-6 flex flex-wrap items-center gap-3 rounded-xl border border-cyanic-500/30 bg-cyanic-500/[0.06] px-4 py-3">
            <span className="text-[16px]" aria-hidden>
              📦
            </span>
            <p className="min-w-0 flex-1 text-[12.5px] leading-relaxed text-mist-300">
              <strong className="text-mist-100">Sandbox URLs expire — take Vishal.AI with you.</strong>{" "}
              The <strong>Forever Edition</strong> is one file that runs in any browser, forever —
              no server, no hosting. Or grab the source to deploy the full version (README inside).
            </p>
            <div className="flex shrink-0 flex-wrap gap-2">
              <a
                href="/download/vishal-ai-forever.html"
                download
                className="rounded-lg bg-ember-500 px-3.5 py-2 text-[12.5px] font-semibold text-ink-950 transition-opacity hover:opacity-90"
                title="One file, runs forever in any browser — no server needed"
              >
                ⬇ Forever Edition
              </a>
              <a
                href="/download/vishal-ai-source.zip"
                download
                className="rounded-lg border border-cyanic-500/50 px-3.5 py-2 text-[12.5px] font-semibold text-cyanic-500 transition-colors hover:bg-cyanic-500/10"
              >
                Source (deploy)
              </a>
            </div>
          </div>

          {/* Brain status — shown only when no brain is configured */}
          {!brain && (
            <Link
              href="/settings"
              className="mt-6 flex items-center gap-3 rounded-xl border border-ember-500/40 bg-ember-500/10 px-4 py-3 transition-colors hover:bg-ember-500/15"
            >
              <IconGear size={16} className="shrink-0 text-ember-400" />
              <p className="text-[13px] text-mist-100">
                <strong>Connect a brain</strong> to unlock answers to anything — add any OpenAI,
                Anthropic, Gemini, Qwen, or Groq/OpenRouter key in Settings (≈30 seconds).
              </p>
              <IconArrowRight size={14} className="ml-auto shrink-0 text-ember-400" />
            </Link>
          )}

          {/* Install app */}
          <div className="mt-3">
            <InstallPWA />
          </div>

          {/* Stats */}
          <div className="mt-7 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {stats.map((s) => (
              <div
                key={s.label}
                className="rounded-xl border border-ink-700 bg-ink-850/80 px-4 py-3.5"
              >
                <div className="font-display text-2xl font-semibold tracking-tight text-mist-100">
                  {s.value}
                </div>
                <div className="mt-0.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-mist-500">
                  {s.label}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-5">
            {/* Capabilities */}
            <div className="rounded-xl border border-ink-700 bg-ink-900/50 lg:col-span-3">
              <div className="border-b border-ink-700/70 px-5 py-3.5">
                <h2 className="font-display text-[14px] font-semibold text-mist-100">
                  One mind, many capabilities
                </h2>
                <p className="text-[11.5px] text-mist-500">
                  Blended seamlessly per request — never separate modes, one companion
                </p>
              </div>
              <div className="grid grid-cols-1 gap-2 p-4 sm:grid-cols-2">
                {CAPABILITIES.map((c) => (
                  <Link
                    key={c.title}
                    href="/chat"
                    className="group flex items-center gap-3 rounded-lg border border-ink-700 bg-ink-850/70 px-3.5 py-2.5 transition-all hover:border-ember-500/40 hover:bg-ink-800"
                  >
                    <span className="text-[17px]" aria-hidden>
                      {c.emoji}
                    </span>
                    <span className="min-w-0">
                      <span className="block font-display text-[12.5px] font-semibold text-mist-100">
                        {c.title}
                      </span>
                      <span className="block truncate text-[11px] text-mist-500">
                        {c.blurb}
                      </span>
                    </span>
                  </Link>
                ))}
              </div>
            </div>

            {/* Recent sessions */}
            <div className="rounded-xl border border-ink-700 bg-ink-900/50 lg:col-span-2">
              <div className="flex items-center justify-between border-b border-ink-700/70 px-5 py-3.5">
                <h2 className="font-display text-[14px] font-semibold text-mist-100">
                  Recent sessions
                </h2>
                <Link
                  href="/chat"
                  className="text-[11px] font-semibold text-ember-400 hover:text-ember-300"
                >
                  View all
                </Link>
              </div>
              <div className="p-3">
                {recent.length === 0 && (
                  <div className="px-3 py-8 text-center">
                    <LogoMark size={22} className="mx-auto text-mist-500/60" />
                    <p className="mt-2.5 text-[12.5px] text-mist-500">
                      No sessions yet — open the console and start with anything.
                    </p>
                  </div>
                )}
                {recent.map((c) => (
                  <Link
                    key={c.id}
                    href={`/chat?c=${c.id}`}
                    className="group flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-ink-800"
                  >
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-ember-500/70" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-mist-300 group-hover:text-mist-100">
                        {c.title}
                      </span>
                      <span className="block text-[10.5px] text-mist-500">
                        {timeAgo(c.updatedAt)}
                      </span>
                    </span>
                    <IconArrowRight
                      size={13}
                      className="shrink-0 text-mist-500 opacity-0 transition-opacity group-hover:opacity-100"
                    />
                  </Link>
                ))}
              </div>
            </div>
          </div>

          {/* Signature principle */}
          <div className="mt-6 rounded-xl border border-ember-500/25 bg-ember-500/[0.05] px-5 py-4">
            <div className="text-[10.5px] font-bold uppercase tracking-[0.16em] text-ember-400">
              Signature principle
            </div>
            <p className="mt-1.5 font-display text-[14px] leading-relaxed text-mist-300">
              Think deeply · Verify carefully · Explain clearly · Create boldly · Act
              usefully · Learn from feedback ·{" "}
              <span className="text-ember-300">Never fabricate</span>
            </p>
            <p className="mt-1 text-[11.5px] text-mist-500">
              Honest limitation: this build has no live web search — for current events and
              citations, verify with primary sources.
            </p>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
