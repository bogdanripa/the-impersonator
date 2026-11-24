import { NextResponse } from "next/server";
import { personaReply } from "@/lib/chat";
import { handleError, jsonError } from "@/lib/http";

export const maxDuration = 300;

export async function POST(request: Request, ctx: RouteContext<"/api/conversations/[id]/messages">) {
  try {
    const { id } = await ctx.params;
    const { text } = (await request.json().catch(() => ({}))) as { text?: string };
    if (!text?.trim()) return jsonError("Message is empty");
    const result = await personaReply(id, text.trim());
    return NextResponse.json(result);
  } catch (err) {
    return handleError(err);
  }
}
