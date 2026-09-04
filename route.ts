import { db } from "@/db";
import { tasks } from "@/db/schema";
import { asc, desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db
    .select()
    .from(tasks)
    .orderBy(asc(tasks.order), asc(tasks.createdAt));
  return Response.json({ tasks: rows });
}

export async function POST(req: Request) {
  const body = await req.json();
  if (typeof body?.title !== "string" || body.title.trim().length === 0) {
    return Response.json({ error: "Title is required" }, { status: 400 });
  }
  const priority = ["low", "medium", "high"].includes(body.priority)
    ? body.priority
    : "medium";
  const maxOrder = await db
    .select({ order: tasks.order })
    .from(tasks)
    .orderBy(desc(tasks.order))
    .limit(1);
  const created = await db
    .insert(tasks)
    .values({
      title: body.title.trim().slice(0, 300),
      priority,
      source: "user",
      order: (maxOrder[0]?.order ?? 0) + 1,
    })
    .returning();
  return Response.json({ task: created[0] });
}
