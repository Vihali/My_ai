"use client";

import { useCallback, useEffect, useState } from "react";
import { IconBolt } from "@/components/icons";

interface SettingsState {
  configured: boolean;
  provider: string;
  model?: string;
  baseUrl?: string;
  maskedKey?: string;
}

const PROVIDER_INFO: Record<
  string,
  { label: string; hint: string; defaultModel: string; keyPlaceholder: string }
> = {
  openai: {
    label: "OpenAI",
    hint: "platform.openai.com → API keys",
    defaultModel: "gpt-4o-mini",
    keyPlaceholder: "sk-…",
  },
  anthropic: {
    label: "Anthropic (Claude)",
    hint: "console.anthropic.com → API keys",
    defaultModel: "claude-3-5-haiku-latest",
    keyPlaceholder: "sk-ant-…",
  },
  gemini: {
    label: "Google Gemini",
    hint: "aistudio.google.com → Get API key (free tier)",
    defaultModel: "gemini-2.0-flash",
    keyPlaceholder: "AIza…",
  },
  qwen: {
    label: "Qwen (Alibaba DashScope)",
    hint: "bailian.console.aliyun.com → API-KEY (free trial credits)",
    defaultModel: "qwen3-max",
    keyPlaceholder: "sk-…",
  },
  custom: {
    label: "OpenAI-compatible (Groq, OpenRouter, local…)",
    hint: "Any endpoint speaking the OpenAI API",
    defaultModel: "llama-3.3-70b-versatile",
    keyPlaceholder: "gsk_… / sk-or-… / anything",
  },
};

export default function SettingsClient() {
  const [state, setState] = useState<SettingsState | null>(null);
  const [provider, setProvider] = useState("openai");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/settings");
      const data = await res.json();
      setState(data);
      if (data.configured) {
        setProvider(data.provider ?? "openai");
        setModel(data.model ?? "");
        setBaseUrl(data.baseUrl ?? "");
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    if (saving) return;
    setSaving(true);
    setNotice(null);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, apiKey, model, baseUrl }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Save failed");
      setApiKey("");
      await load();
      setNotice({ kind: "ok", text: "Brain saved. Use “Test connection” to confirm it works." });
    } catch (e) {
      setNotice({ kind: "err", text: e instanceof Error ? e.message : "Save failed" });
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    if (testing) return;
    setTesting(true);
    setNotice(null);
    try {
      const res = await fetch("/api/settings/test", { method: "POST" });
      const data = await res.json();
      if (data.ok) {
        setNotice({
          kind: "ok",
          text: `Connected! ${data.provider} / ${data.model} replied in ${data.latencyMs}ms. I can now answer anything.`,
        });
      } else {
        setNotice({ kind: "err", text: `Connection failed: ${data.error}` });
      }
    } catch {
      setNotice({ kind: "err", text: "Connection test could not run." });
    } finally {
      setTesting(false);
    }
  };

  const info = PROVIDER_INFO[provider];

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-2xl px-5 py-8">
        <h1 className="font-display text-xl font-semibold tracking-tight text-mist-100">
          Connect a brain
        </h1>
        <p className="mt-1.5 max-w-xl text-[13.5px] leading-relaxed text-mist-500">
          Add any API key and I'll answer <strong className="text-mist-300">anything</strong> —
          knowledge, explanations, writing, coding — with my memory and your tasks built in.
          Your key is stored on this server only and never shown back in full.
        </p>

        {/* Status */}
        <div
          className={`mt-5 flex items-center gap-3 rounded-xl border px-4 py-3 ${
            state?.configured
              ? "border-sage-500/40 bg-sage-500/10"
              : "border-ember-500/40 bg-ember-500/10"
          }`}
        >
          <span
            className={`h-2.5 w-2.5 shrink-0 rounded-full ${
              state?.configured ? "bg-sage-500" : "bg-ember-500"
            }`}
          />
          {state === null ? (
            <span className="text-[13px] text-mist-500">Checking…</span>
          ) : state.configured ? (
            <span className="text-[13px] text-mist-100">
              Brain connected — <strong>{state.provider}</strong> / {state.model}
              {state.maskedKey ? <span className="text-mist-500"> · key {state.maskedKey}</span> : null}
            </span>
          ) : (
            <span className="text-[13px] text-mist-100">
              No brain yet — I can compute, plan, remember and chat, but open-ended answers
              need a key below.
            </span>
          )}
        </div>

        {/* Form */}
        <div className="mt-5 rounded-xl border border-ink-700 bg-ink-850 p-4">
          <label className="block text-[11px] font-bold uppercase tracking-[0.14em] text-mist-500">
            Provider
          </label>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {Object.entries(PROVIDER_INFO).map(([key, p]) => (
              <button
                key={key}
                onClick={() => {
                  setProvider(key);
                  setModel("");
                }}
                className={`rounded-lg border px-3 py-2.5 text-left transition-colors ${
                  provider === key
                    ? "border-ember-500/60 bg-ember-500/10"
                    : "border-ink-600 bg-ink-900/60 hover:border-ink-500"
                }`}
              >
                <span className={`block text-[13px] font-semibold ${provider === key ? "text-ember-300" : "text-mist-300"}`}>
                  {p.label}
                </span>
                <span className="block text-[11px] text-mist-500">{p.hint}</span>
              </button>
            ))}
          </div>

          <label className="mt-4 block text-[11px] font-bold uppercase tracking-[0.14em] text-mist-500">
            API key
          </label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={state?.configured ? `Stored (${state.maskedKey}) — paste a new one to replace` : info.keyPlaceholder}
            autoComplete="off"
            className="mt-1.5 w-full rounded-lg border border-ink-600 bg-ink-900 px-3 py-2 font-mono text-[13px] text-mist-100 placeholder:text-mist-500/70 focus:border-ember-500/60 focus:outline-none"
          />

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-[0.14em] text-mist-500">
                Model
              </label>
              <input
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder={info.defaultModel}
                className="mt-1.5 w-full rounded-lg border border-ink-600 bg-ink-900 px-3 py-2 font-mono text-[12.5px] text-mist-100 placeholder:text-mist-500/70 focus:border-ember-500/60 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-[0.14em] text-mist-500">
                Base URL{" "}
                <span className="normal-case text-mist-500/70">(Qwen region / custom endpoint)</span>
              </label>
              <input
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder={
                  provider === "qwen"
                    ? "https://dashscope-intl.aliyuncs.com/compatible-mode/v1"
                    : "https://api.groq.com/openai/v1"
                }
                disabled={provider !== "custom" && provider !== "qwen"}
                className="mt-1.5 w-full rounded-lg border border-ink-600 bg-ink-900 px-3 py-2 font-mono text-[12.5px] text-mist-100 placeholder:text-mist-500/70 focus:border-ember-500/60 focus:outline-none disabled:opacity-40"
              />
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <button
              onClick={save}
              disabled={saving || (!apiKey && !state?.configured)}
              className="flex items-center gap-1.5 rounded-lg bg-ember-500 px-4 py-2 text-[13px] font-semibold text-ink-950 transition-colors hover:bg-ember-400 disabled:opacity-35"
            >
              <IconBolt size={13} />
              {saving ? "Saving…" : state?.configured ? "Update brain" : "Connect brain"}
            </button>
            <button
              onClick={test}
              disabled={testing || !state?.configured}
              className="rounded-lg border border-ink-600 bg-ink-800 px-4 py-2 text-[13px] font-semibold text-mist-300 transition-colors hover:border-ink-500 disabled:opacity-35"
            >
              {testing ? "Testing…" : "Test connection"}
            </button>
          </div>

          {notice && (
            <div
              className={`anim-rise mt-3 rounded-lg border px-3 py-2 text-[12.5px] ${
                notice.kind === "ok"
                  ? "border-sage-500/40 bg-sage-500/10 text-sage-500"
                  : "border-danger-500/40 bg-danger-500/10 text-danger-500"
              }`}
            >
              {notice.text}
            </div>
          )}
        </div>

        <div className="mt-5 rounded-lg border border-ink-700 bg-ink-850/60 px-4 py-3 text-[12px] leading-relaxed text-mist-500">
          <strong className="text-mist-300">Why BYO-key?</strong> This sandbox ships without an
          LLM subscription, so you bring the brain you trust. Everything else — memory, tasks,
          planning, math, safety policy — is built in and works without any key.
        </div>
      </div>
    </div>
  );
}
