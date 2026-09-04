import { callLLM, getLLMConfig } from "@/lib/llm";

export const dynamic = "force-dynamic";

export async function POST() {
  const cfg = await getLLMConfig();
  if (!cfg) {
    return Response.json(
      { ok: false, error: "No brain configured yet — save an API key first." },
      { status: 400 }
    );
  }
  const start = Date.now();
  const result = await callLLM(cfg, "You are a test endpoint. Reply with the single word: ok", [
    { role: "user", content: "ping" },
  ]);
  const latencyMs = Date.now() - start;
  if (!result.ok) {
    return Response.json({ ok: false, error: result.error, provider: cfg.provider, model: cfg.model });
  }
  return Response.json({ ok: true, provider: cfg.provider, model: cfg.model, latencyMs });
}
