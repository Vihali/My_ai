import { db } from "@/db";
import { memories } from "@/db/schema";
import { asc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db.select().from(memories).orderBy(asc(memories.createdAt));
  return Response.json({ memories: rows });
}

export async function POST(req: Request) {
  const body = await req.json();
  if (typeof body?.content !== "string" || body.content.trim().length === 0) {
    return Response.json({ error: "Content is required" }, { status: 400 });
  }
  const kind = ["preference", "fact", "workflow"].includes(body.kind)
    ? body.kind
    : "fact";
  const created = await db
    .insert(memories)
    .values({ content: body.content.trim().slice(0, 500), kind, source: "user" })
    .returning();
  return Response.json({ memory: created[0] });
}
