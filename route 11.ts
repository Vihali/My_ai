import { db } from "@/db";
import { conversations, messages } from "@/db/schema";
import { asc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  const conv = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, id))
    .limit(1);
  if (conv.length === 0) {
    return Response.json({ error: "Conversation not found" }, { status: 404 });
  }
  const msgs = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, id))
    .orderBy(asc(messages.createdAt), asc(messages.id));
  return Response.json({ conversation: conv[0], messages: msgs });
}

export async function PATCH(req: Request, { params }: Params) {
  const { id } = await params;
  const body = await req.json();
  if (typeof body?.title !== "string" || body.title.trim().length === 0) {
    return Response.json({ error: "Title is required" }, { status: 400 });
  }
  const updated = await db
    .update(conversations)
    .set({ title: body.title.trim().slice(0, 80), updatedAt: new Date() })
    .where(eq(conversations.id, id))
    .returning();
  if (updated.length === 0) {
    return Response.json({ error: "Conversation not found" }, { status: 404 });
  }
  return Response.json({ conversation: updated[0] });
}

export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params;
  await db.delete(conversations).where(eq(conversations.id, id));
  return Response.json({ ok: true });
}
