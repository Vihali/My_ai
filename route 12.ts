import { db, ensureSchema } from "@/db";
import { conversations, memories, messages, tasks } from "@/db/schema";
import { runAssistant } from "@/lib/assistant";
import { isSexualContent, SEXUAL_DECLINE } from "@/lib/safety";
import { buildSystemPrompt, callLLM, getLLMConfig, type ChatTurn } from "@/lib/llm";
import { asc, desc, eq, ne } from "drizzle-orm";

export const dynamic = "force-dynamic";

function titleFrom(text: string): string {
  const t = text.trim().replace(/\s+/g, " ");
  return t.length > 44 ? t.slice(0, 44).trimEnd() + "…" : t;
}

function extractArtifact(content: string): { title: string; html: string } | null {
  // Prefer fenced html blocks; fall back to any fenced block containing a full document
  const fences = [...content.matchAll(/```([\w-]*)[^\n]*\n([\s\S]*?)```/g)];
  for (const f of fences) {
    const candidate = f[2];
    if (/<!doctype html|<html[\s>]/i.test(candidate)) {
      const title =
        candidate.match(/<title>\s*([^<]+?)\s*<\/title>/i)?.[1] ??
        candidate.match(/<h1[^>]*>\s*([^<]+?)\s*<\/h1>/i)?.[1] ??
        "Interactive preview";
      return { title: title.slice(0, 80), html: candidate };
    }
  }
  return null;
}

export async function POST(req: Request) {
  try {
    await ensureSchema();
    const body = await req.json();
    const content: unknown = body?.message;
    const conversationId: unknown = body?.conversationId;

    if (typeof content !== "string" || content.trim().length === 0) {
      return Response.json({ error: "Message is required" }, { status: 400 });
    }
    const text = content.trim();

    // Resolve or create conversation
    let convId: string;
    if (typeof conversationId === "string" && conversationId.length > 0) {
      const existing = await db
        .select()
        .from(conversations)
        .where(eq(conversations.id, conversationId))
        .limit(1);
      if (existing.length === 0) {
        return Response.json({ error: "Conversation not found" }, { status: 404 });
      }
      convId = existing[0].id;
      if (existing[0].title === "New session") {
        await db
          .update(conversations)
          .set({ title: titleFrom(text), updatedAt: new Date() })
          .where(eq(conversations.id, convId));
      }
    } else {
      const created = await db
        .insert(conversations)
        .values({ title: titleFrom(text) })
        .returning();
      convId = created[0].id;
    }

    await db.insert(messages).values({
      conversationId: convId,
      role: "user",
      content: text,
    });

    // ---- Safety gate: sexual content is declined, full stop -----------------
    if (isSexualContent(text)) {
      const declined = await db
        .insert(messages)
        .values({
          conversationId: convId,
          role: "assistant",
          content: SEXUAL_DECLINE,
          mode: "FRIENDLY",
          meta: { actions: [], followUps: ["Tell me a joke", "Help me with my studies"] },
        })
        .returning();
      await db
        .update(conversations)
        .set({ updatedAt: new Date() })
        .where(eq(conversations.id, convId));
      return Response.json({
        conversationId: convId,
        assistant: {
          id: declined[0].id,
          content: SEXUAL_DECLINE,
          mode: "FRIENDLY",
          actions: [],
          followUps: ["Tell me a joke", "Help me with my studies"],
        },
      });
    }

    // ---- Local engine pass ---------------------------------------------------
    const [memRows, taskRows] = await Promise.all([
      db.select().from(memories).orderBy(asc(memories.createdAt)),
      db
        .select()
        .from(tasks)
        .where(ne(tasks.status, "done"))
        .orderBy(asc(tasks.order), asc(tasks.createdAt)),
    ]);

    const engineResult = runAssistant(text, {
      memories: memRows.map((m) => ({ id: m.id, content: m.content, kind: m.kind })),
      openTasks: taskRows.map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        priority: t.priority,
      })),
    });

    let replyContent = engineResult.content;
    let replyFollowUps = engineResult.followUps ?? [];
    let usedBrain = false;

    // ---- Connected brain pass (unified, for everything open-ended) -----------
    const cfg = await getLLMConfig();
    if (cfg && engineResult.preferLLM) {
      const history = await db
        .select()
        .from(messages)
        .where(eq(messages.conversationId, convId))
        .orderBy(asc(messages.createdAt), asc(messages.id));
      // Full history including the user message just inserted (it is the final turn)
      const turns: ChatTurn[] = history.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));
      const system = buildSystemPrompt(
        memRows.map((m) => m.content),
        taskRows.map((t) => t.title)
      );
      // Generous conversational memory: last 40 exchanges go to the brain
      const call = await callLLM(cfg, system, turns.slice(-40));
      if (call.ok) {
        replyContent = call.text;
        usedBrain = true;
      } else if (engineResult.needsKnowledge) {
        const overloaded = /overload|demand|unavailable|capacity|rate.?limit|429|503|timeout|timed out/i.test(
          call.error
        );
        const note = overloaded
          ? `\n\n> ⚠️ My brain's provider is temporarily overloaded (*${call.error}*). Your key is fine — just send the message again in a few seconds and I'll retry.`
          : `\n\n> ⚠️ I tried my connected brain but it didn't respond: *${call.error}*. Double-check the key and model in Settings.`;
        replyContent = engineResult.content + note;
      }
    }

    // ---- Apply engine side effects only for engine-owned replies -------------
    const appliedActions: { type: string; label: string }[] = [];
    if (!usedBrain) {
      for (const action of engineResult.actions ?? []) {
        if (action.type === "memory.save" && action.payload?.content) {
          await db.insert(memories).values({
            content: action.payload.content,
            kind: action.payload.kind ?? "fact",
            source: "assistant",
          });
          appliedActions.push(action);
        } else if (action.type === "memory.forget" && action.payload?.content) {
          await db.delete(memories).where(eq(memories.id, action.payload.content));
          appliedActions.push(action);
        } else if (action.type === "memory.clear") {
          await db.delete(memories);
          appliedActions.push(action);
        } else if (action.type === "task.create" && action.payload?.title) {
          const maxOrder = await db
            .select({ order: tasks.order })
            .from(tasks)
            .orderBy(desc(tasks.order))
            .limit(1);
          await db.insert(tasks).values({
            title: action.payload.title,
            priority: action.payload.priority ?? "medium",
            source: "assistant",
            order: (maxOrder[0]?.order ?? 0) + 1,
          });
          appliedActions.push(action);
        }
      }
    }

    const artifact = extractArtifact(replyContent);
    const assistantMsg = await db
      .insert(messages)
      .values({
        conversationId: convId,
        role: "assistant",
        content: replyContent,
        mode: engineResult.mode,
        meta: { actions: appliedActions, followUps: replyFollowUps, artifact: artifact ?? undefined },
      })
      .returning();

    await db
      .update(conversations)
      .set({ updatedAt: new Date() })
      .where(eq(conversations.id, convId));

    const conv = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, convId))
      .limit(1);

    return Response.json({
      conversationId: convId,
      title: conv[0]?.title ?? "New session",
      brain: usedBrain ? { provider: cfg?.provider, model: cfg?.model } : null,
      assistant: {
        id: assistantMsg[0].id,
        content: replyContent,
        mode: engineResult.mode,
        actions: appliedActions,
        followUps: replyFollowUps,
        artifact,
      },
    });
  } catch (err) {
    console.error("chat error", err);
    return Response.json({ error: "Something went wrong" }, { status: 500 });
  }
}
