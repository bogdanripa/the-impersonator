import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { personaReply } from "@/lib/chat";
import { db, schema } from "@/lib/db";
import { handleError, jsonError } from "@/lib/http";

export const maxDuration = 300;

export async function POST(request: Request, ctx: RouteContext<"/api/conversations/[id]/messages">) {
  try {
    const { id } = await ctx.params;
    const { text } = (await request.json().catch(() => ({}))) as { text?: string };
    if (!text?.trim()) return jsonError("Message is empty");
    const conversation = await db.query.conversations.findFirst({ where: eq(schema.conversations.id, id) });
    if (!conversation) return jsonError("Conversation not found", 404);
    const viewer = request.headers.get("x-user-email");
    if (conversation.createdBy && conversation.createdBy !== viewer) {
      return jsonError("This is a shared conversation. Start your own to ask questions.", 403);
    }
    const result = await personaReply(id, text.trim());
    return NextResponse.json(result);
  } catch (err) {
    return handleError(err);
  }
}
