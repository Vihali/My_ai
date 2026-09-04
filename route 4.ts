import { db } from "@/db";
import { settings } from "@/db/schema";
import { defaultModelFor } from "@/lib/llm";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

const PROVIDERS = ["openai", "anthropic", "gemini", "qwen", "custom"];

function mask(key: string): string {
  if (key.length <= 8) return "••••";
  return `${key.slice(0, 4)}…${key.slice(-4)}`;
}

export async function GET() {
  const rows = await db.select().from(settings).where(eq(settings.id, "main")).limit(1);
  const row = rows[0];
  if (!row?.apiKey) {
    return Response.json({ configured: false, provider: row?.provider ?? "openai" });
  }
  return Response.json({
    configured: true,
    provider: row.provider,
    model: row.model || defaultModelFor(row.provider),
    baseUrl: row.baseUrl ?? "",
    maskedKey: mask(row.apiKey),
  });
}

export async function POST(req: Request) {
  const body = await req.json();
  const provider = PROVIDERS.includes(body?.provider) ? body.provider : "openai";
  const existing = await db.select().from(settings).where(eq(settings.id, "main")).limit(1);

  const model =
    typeof body?.model === "string" && body.model.trim()
      ? body.model.trim().slice(0, 120)
      : existing[0]?.model || defaultModelFor(provider);
  const baseUrl =
    typeof body?.baseUrl === "string" && body.baseUrl.trim()
      ? body.baseUrl.trim().slice(0, 300)
      : existing[0]?.baseUrl || null;
  const apiKey =
    typeof body?.apiKey === "string" && body.apiKey.trim()
      ? body.apiKey.trim().slice(0, 300)
      : existing[0]?.apiKey || null;

  if (!apiKey) {
    return Response.json({ error: "An API key is required" }, { status: 400 });
  }

  const saved = await db
    .insert(settings)
    .values({ id: "main", provider, model, baseUrl, apiKey, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: settings.id,
      set: { provider, model, baseUrl, apiKey, updatedAt: new Date() },
    })
    .returning();

  return Response.json({
    configured: true,
    provider: saved[0].provider,
    model: saved[0].model,
    baseUrl: saved[0].baseUrl,
    maskedKey: mask(saved[0].apiKey ?? ""),
  });
}
