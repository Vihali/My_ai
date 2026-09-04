import { db } from "@/db";
import { tasks } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  const { id } = await params;
  const body = await req.json();
  const patch: Partial<typeof tasks.$inferInsert> = {};
  if (typeof body?.status === "string" && ["todo", "doing", "done"].includes(body.status)) {
    patch.status = body.status;
    patch.completedAt = body.status === "done" ? new Date() : null;
  }
  if (typeof body?.priority === "string" && ["low", "medium", "high"].includes(body.priority)) {
    patch.priority = body.priority;
  }
  if (typeof body?.title === "string" && body.title.trim().length > 0) {
    patch.title = body.title.trim().slice(0, 300);
  }
  if (Object.keys(patch).length === 0) {
    return Response.json({ error: "Nothing to update" }, { status: 400 });
  }
  const updated = await db
    .update(tasks)
    .set(patch)
    .where(eq(tasks.id, id))
    .returning();
  if (updated.length === 0) {
    return Response.json({ error: "Task not found" }, { status: 404 });
  }
  return Response.json({ task: updated[0] });
}

export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params;
  await db.delete(tasks).where(eq(tasks.id, id));
  return Response.json({ ok: true });
}
