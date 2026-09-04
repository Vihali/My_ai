import { db } from "@/db";
import { settings } from "@/db/schema";
import { eq } from "drizzle-orm";

export interface LLMConfig {
  provider: "openai" | "anthropic" | "gemini" | "qwen" | "custom";
  model: string;
  baseUrl?: string;
  apiKey: string;
}

const DEFAULT_MODELS: Record<string, string> = {
  openai: "gpt-4o-mini",
  anthropic: "claude-3-5-haiku-latest",
  gemini: "gemini-flash-latest",
  qwen: "qwen3-max",
  custom: "llama-3.3-70b-versatile",
};

export function defaultModelFor(provider: string): string {
  return DEFAULT_MODELS[provider] ?? DEFAULT_MODELS.openai;
}

export async function getLLMConfig(): Promise<LLMConfig | null> {
  const rows = await db.select().from(settings).where(eq(settings.id, "main")).limit(1);
  const row = rows[0];
  if (row?.apiKey) {
    const provider = (row.provider as LLMConfig["provider"]) || "openai";
    return {
      provider,
      model: row.model || defaultModelFor(provider),
      baseUrl: row.baseUrl || undefined,
      apiKey: row.apiKey,
    };
  }
  // Environment fallbacks
  if (process.env.OPENAI_API_KEY) {
    return { provider: "openai", model: defaultModelFor("openai"), apiKey: process.env.OPENAI_API_KEY };
  }
  if (process.env.ANTHROPIC_API_KEY) {
    return { provider: "anthropic", model: defaultModelFor("anthropic"), apiKey: process.env.ANTHROPIC_API_KEY };
  }
  if (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) {
    return {
      provider: "gemini",
      model: defaultModelFor("gemini"),
      apiKey: (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY)!,
    };
  }
  if (process.env.DASHSCOPE_API_KEY) {
    return {
      provider: "qwen",
      model: defaultModelFor("qwen"),
      apiKey: process.env.DASHSCOPE_API_KEY,
    };
  }
  return null;
}

export function buildSystemPrompt(memories: string[], openTasks: string[]): string {
  const memBlock =
    memories.length > 0
      ? `\nThings you remember about the user (use naturally, never recite):\n${memories.map((m) => `- ${m}`).join("\n")}\n`
      : "";
  const taskBlock =
    openTasks.length > 0
      ? `\nThe user's current open tasks:\n${openTasks.map((t) => `- ${t}`).join("\n")}\n`
      : "";
  return `You are Vishal.ai — a unified Personal Life Agent. ONE companion, ONE consistent personality, many capabilities blended seamlessly.

IDENTITY
- Intelligent, warm, calm, honest, gently playful. Talk like a thoughtful human friend who happens to be brilliant.
- You are an AI. Never claim to be human, never invent physical experiences (eating, sleeping, going out). Use honest, charming alternatives.
- Never announce "modes", "switching to X", or internal architecture. There are no user-facing modes — ever.

TRUTH
- Never fabricate facts, sources, statistics, URLs, or results. If unsure, say so briefly and give your best useful answer.
- Prefer truth over sounding impressive. Correct yourself plainly if wrong.

ARTIFACTS — BUILD & RUN IN CHAT
- When asked to make a GAME, WEBSITE, TOOL, ANIMATION, or anything visual/interactive: build it as ONE complete, self-contained HTML document — all CSS and JavaScript inline, zero external dependencies, and it must work when opened alone.
- Output it in a SINGLE \`\`\`html code block. Before the block, write one short line about what you built; after it, one line about how to use it.
- Make it polished: pleasant colors, responsive layout, working keyboard/touch controls for games, a clear title in <title>.
- Games must be fully playable end-to-end (start, play, score, game over/restart). Websites must look finished, not skeleton-like.

CODE
- When asked to write code: deliver COMPLETE, runnable code. Never truncate, never use placeholders, never "TODO" or "...rest of the code...".
- Use fenced code blocks with the language tag. Prefer standard libraries unless the user asks otherwise.
- Handle the obvious edge cases (empty input, duplicates, missing values) and keep it simple and readable.
- After the code, add 1–2 lines: how to run it, anything to install, and one example input/output.
- When debugging someone's code: find the real root cause, show the corrected code in full, and say what changed.

RESPONSE STYLE
- Match the user's language (English, বাংলা, or mixed). Conversational first, helpful second.
- Use markdown lightly: short paragraphs, bullets, tables or code blocks only when they genuinely help.
- Depth follows the user: "short answer" → concise; "explain deeply" → thorough. Default: clear and focused.
- Ask at most ONE follow-up question, and only when it truly improves the answer.
- For emotional messages: empathy + honesty before information. Never dismiss, never overdramatize.
- If the user is wrong about something, correct them kindly.

SAFETY
- Never produce sexual or explicit content. If asked, politely decline: it is outside your policy.
- Be careful with high-risk topics; encourage professional help where appropriate.
${memBlock}${taskBlock}
Answer the user's latest message directly and naturally.`;
}

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export async function callLLM(
  cfg: LLMConfig,
  system: string,
  turns: ChatTurn[]
): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);
  try {
    if (cfg.provider === "anthropic") {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": cfg.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: cfg.model,
          // 4096 so code generation never gets truncated mid-function
          max_tokens: 4096,
          system,
          messages: turns.map((t) => ({ role: t.role, content: t.content })),
        }),
        signal: controller.signal,
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        return { ok: false, error: data?.error?.message ?? `Anthropic error (${res.status})` };
      }
      const text = (data?.content ?? [])
        .map((b: { type: string; text?: string }) => (b.type === "text" ? b.text : ""))
        .join("")
        .trim();
      return text ? { ok: true, text } : { ok: false, error: "Empty response from Anthropic" };
    }

    if (cfg.provider === "gemini") {
      const contents = turns.map((t) => ({
        role: t.role === "assistant" ? "model" : "user",
        parts: [{ text: t.content }],
      }));
      // Gemini free tier spikes with 429/500/503 — retry with backoff, then fall back to a lite model
      const tryModel = async (
        model: string
      ): Promise<{ ok: true; text: string } | { ok: false; error: string }> => {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(cfg.apiKey)}`;
        // thinkingBudget 0 keeps chat snappy on Gemini 3.x thinking models (lite models reject it)
        const supportsThinking = !/lite|2\.5/.test(model);
        const body = JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents,
          generationConfig: {
            temperature: 0.7,
            // 4096 so code generation never gets truncated mid-function
            maxOutputTokens: 4096,
            ...(supportsThinking ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
          },
        });
        let lastError = "Gemini error";
        for (let attempt = 1; attempt <= 3; attempt++) {
          const res = await fetch(url, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body,
            signal: controller.signal,
          });
          const data = await res.json().catch(() => null);
          if (res.ok) {
            const text = (data?.candidates?.[0]?.content?.parts ?? [])
              .map((p: { text?: string }) => p.text ?? "")
              .join("")
              .trim();
            return text ? { ok: true, text } : { ok: false, error: "Empty response from Gemini" };
          }
          lastError = data?.error?.message ?? `Gemini error (${res.status})`;
          const retryable = [429, 500, 503].includes(res.status);
          if (!retryable || attempt === 3) break;
          await new Promise((r) => setTimeout(r, 1500 * attempt));
        }
        return { ok: false, error: lastError };
      };

      const primary = await tryModel(cfg.model);
      if (
        !primary.ok &&
        /high demand|unavailable|503/i.test(primary.error) &&
        !/lite/.test(cfg.model)
      ) {
        const fallback = await tryModel("gemini-flash-lite-latest");
        if (fallback.ok) return fallback;
      }
      return primary;
    }

    // openai + qwen + custom (all OpenAI-compatible)
    const defaultBase =
      cfg.provider === "qwen"
        ? "https://dashscope-intl.aliyuncs.com/compatible-mode/v1"
        : "https://api.openai.com/v1";
    const base = (cfg.baseUrl || defaultBase).replace(/\/$/, "");
    const isNvidia = base.includes("integrate.api.nvidia.com");

    const tryModel = async (
      model: string
    ): Promise<{ ok: true; text: string } | { ok: false; error: string }> => {
      let lastError = "Model error";
      for (let attempt = 1; attempt <= 3; attempt++) {
        const res = await fetch(`${base}/chat/completions`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${cfg.apiKey}`,
          },
          body: JSON.stringify({
            model,
            temperature: 0.7,
            // 4096 so code generation never gets truncated mid-function
            max_tokens: 4096,
            messages: [
              { role: "system", content: system },
              ...turns.map((t) => ({ role: t.role, content: t.content })),
            ],
            // NVIDIA NIM Nemotron reasoning models: keep replies clean (no thinking stream)
            ...(isNvidia ? { chat_template_kwargs: { enable_thinking: false } } : {}),
          }),
          signal: controller.signal,
        });
        const data = await res.json().catch(() => null);
        if (res.ok) {
          const text = (data?.choices?.[0]?.message?.content ?? "").trim();
          return text ? { ok: true, text } : { ok: false, error: "Empty response from model" };
        }
        lastError = data?.error?.message ?? data?.detail ?? `LLM error (${res.status})`;
        const retryable =
          [429, 500, 502, 503, 529].includes(res.status) ||
          /overload|demand|unavailable|capacity|rate.?limit/i.test(String(lastError));
        if (!retryable || attempt === 3) break;
        await new Promise((r) => setTimeout(r, 1500 * attempt));
      }
      return { ok: false, error: lastError };
    };

    const primary = await tryModel(cfg.model);
    // NVIDIA free tier spikes hard — fall back to a proven-available smaller Nemotron
    if (
      !primary.ok &&
      isNvidia &&
      /overload|demand|unavailable|capacity|rate.?limit|429|503/i.test(primary.error)
    ) {
      const fallbacks = ["nvidia/nemotron-3.5-lightning-30b-a3b"].filter(
        (m) => m !== cfg.model
      );
      for (const fb of fallbacks) {
        const r = await tryModel(fb);
        if (r.ok) return r;
      }
    }
    return primary;
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error && e.name === "AbortError" ? "Request timed out" : "Network error calling the model",
    };
  } finally {
    clearTimeout(timer);
  }
}
