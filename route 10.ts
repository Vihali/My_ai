import { db } from "@/db";
import { conversations } from "@/db/schema";
import { desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db
    .select({
      id: conversations.id,
      title: conversations.title,
      createdAt: conversations.createdAt,
      updatedAt: conversations.updatedAt,
    })
    .from(conversations)
    .orderBy(desc(conversations.updatedAt))
    .limit(100);
  return Response.json({ conversations: rows });
}

export async function POST() {
  const created = await db.insert(conversations).values({}).returning();
  return Response.json({ conversation: created[0] });
}
