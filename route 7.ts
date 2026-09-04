import { db } from "@/db";
import { memories } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  const { id } = await params;
  const body = await req.json();
  const patch: Partial<typeof memories.$inferInsert> = {};
  if (typeof body?.content === "string" && body.content.trim().length > 0) {
    patch.content = body.content.trim().slice(0, 500);
  }
  if (typeof body?.kind === "string" && ["preference", "fact", "workflow"].includes(body.kind)) {
    patch.kind = body.kind;
  }
  if (Object.keys(patch).length === 0) {
    return Response.json({ error: "Nothing to update" }, { status: 400 });
  }
  const updated = await db
    .update(memories)
    .set(patch)
    .where(eq(memories.id, id))
    .returning();
  if (updated.length === 0) {
    return Response.json({ error: "Memory not found" }, { status: 404 });
  }
  return Response.json({ memory: updated[0] });
}

export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params;
  await db.delete(memories).where(eq(memories.id, id));
  return Response.json({ ok: true });
}
