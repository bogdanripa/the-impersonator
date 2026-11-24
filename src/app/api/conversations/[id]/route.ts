import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { handleError, jsonError } from "@/lib/http";

export async function GET(_request: Request, ctx: RouteContext<"/api/conversations/[id]">) {
  try {
    const { id } = await ctx.params;
    const conversation = await db.query.conversations.findFirst({ where: eq(schema.conversations.id, id) });
    if (!conversation) return jsonError("Conversation not found", 404);
    const messages = await db
      .select({
        id: schema.messages.id, role: schema.messages.role, content: schema.messages.content,
        innerThought: schema.messages.innerThought, insightIds: schema.messages.insightIds,
        storyIds: schema.messages.storyIds, ungrounded: schema.messages.ungrounded, createdAt: schema.messages.createdAt,
      })
      .from(schema.messages)
      .where(eq(schema.messages.conversationId, id))
      .orderBy(asc(schema.messages.createdAt));
    return NextResponse.json({ conversation, messages });
  } catch (err) {
    return handleError(err);
  }
}
