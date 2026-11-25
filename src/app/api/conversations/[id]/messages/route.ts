import { NextResponse, after } from "next/server";
import { and, desc, eq, isNull, lt, ne, or } from "drizzle-orm";
import { REPLY_TIMEOUT_MS, runReply } from "@/lib/chat";
import { db, schema } from "@/lib/db";
import { findConversation } from "@/lib/access";
import { handleError, jsonError } from "@/lib/http";

// Also bounds the background reply started with after().
export const maxDuration = 300;

/**
 * Saves the question, then writes the reply in the background. The request returns as soon as the
 * question is stored, so a visitor who switches apps or loses signal loses nothing: the page
 * polls the conversation for the reply. `retry: true` re-runs a failed reply to the last question.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/conversations/[id]/messages">) {
  try {
    const { id } = await ctx.params;
    const { text, retry } = (await request.json().catch(() => ({}))) as { text?: string; retry?: boolean };
    if (!retry && !text?.trim()) return jsonError("Message is empty");
    const conversation = await findConversation(request, id);
    if (!conversation) return jsonError("Conversation not found", 404);
    const viewer = request.headers.get("x-user-email");
    if (conversation.createdBy && conversation.createdBy !== viewer) {
      return jsonError("This is a shared conversation. Continue it as your own copy to ask questions.", 403);
    }

    if (retry) {
      const [last] = await db
        .select({ role: schema.messages.role })
        .from(schema.messages)
        .where(eq(schema.messages.conversationId, id))
        .orderBy(desc(schema.messages.createdAt))
        .limit(1);
      if (last?.role !== "user") return jsonError("There is no question waiting for a reply", 400);
    }

    // Claim the conversation, unless a reply is already being written (one at a time).
    const claimed = await db
      .update(schema.conversations)
      .set({ replyStatus: "thinking", replyError: null, replyStartedAt: new Date() })
      .where(
        and(
          eq(schema.conversations.id, id),
          or(
            isNull(schema.conversations.replyStatus),
            ne(schema.conversations.replyStatus, "thinking"),
            lt(schema.conversations.replyStartedAt, new Date(Date.now() - REPLY_TIMEOUT_MS)),
          ),
        ),
      )
      .returning({ id: schema.conversations.id });
    if (!claimed.length) return jsonError(`Still replying to your last message. Wait for it to finish first.`, 409);

    let user = null;
    if (!retry) {
      try {
        [user] = await db.insert(schema.messages).values({ conversationId: id, role: "user", content: text!.trim() }).returning();
      } catch (err) {
        await db.update(schema.conversations).set({ replyStatus: null }).where(eq(schema.conversations.id, id));
        throw err;
      }
    }
    after(() => runReply(id));
    return NextResponse.json({ user, replyStatus: "thinking" }, { status: 202 });
  } catch (err) {
    return handleError(err);
  }
}
