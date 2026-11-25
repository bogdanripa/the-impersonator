import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { handleError, jsonError } from "@/lib/http";
import { REPLY_TIMEOUT_MS } from "@/lib/chat";
import { findConversation, viewerOrg } from "@/lib/access";
import { isSharedOrg } from "@/lib/org";

/** Any signed-in teammate can read a conversation; only the person who started it can continue it. */
export async function GET(request: Request, ctx: RouteContext<"/api/conversations/[id]">) {
  try {
    const { id } = await ctx.params;
    const conversation = await findConversation(request, id);
    if (!conversation) return jsonError("Conversation not found", 404);
    const messages = await db
      .select({
        id: schema.messages.id, role: schema.messages.role, content: schema.messages.content,
        innerThought: schema.messages.innerThought, insightIds: schema.messages.insightIds,
        storyIds: schema.messages.storyIds, ungrounded: schema.messages.ungrounded, createdAt: schema.messages.createdAt,
        segments: schema.messages.segments, liveIds: schema.messages.liveIds,
      })
      .from(schema.messages)
      .where(eq(schema.messages.conversationId, id))
      .orderBy(asc(schema.messages.createdAt));
    const live = await db
      .select()
      .from(schema.liveEvidence)
      .where(eq(schema.liveEvidence.conversationId, id))
      .orderBy(asc(schema.liveEvidence.retrievedAt));
    const viewer = request.headers.get("x-user-email");
    const canWrite = !conversation.createdBy || conversation.createdBy === viewer;
    // A reply that has been "thinking" past the route's time limit was cut off: offer a retry.
    const stale =
      conversation.replyStatus === "thinking" &&
      (!conversation.replyStartedAt || Date.now() - conversation.replyStartedAt.getTime() > REPLY_TIMEOUT_MS);
    const forkedFromBy = conversation.forkedFrom
      ? (await db.query.conversations.findFirst({ where: eq(schema.conversations.id, conversation.forkedFrom) }))?.createdBy ?? null
      : null;
    return NextResponse.json({
      conversation: {
        ...conversation,
        replyStatus: stale ? "failed" : conversation.replyStatus,
        replyError: stale ? "The reply took too long and was stopped." : conversation.replyError,
        forkedFromBy,
      },
      messages,
      canWrite,
      live,
      // Share links only mean something where colleagues can open them.
      shareable: isSharedOrg(viewerOrg(request)),
    });
  } catch (err) {
    return handleError(err);
  }
}
