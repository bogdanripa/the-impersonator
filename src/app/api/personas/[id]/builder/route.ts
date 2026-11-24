import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import type { BuilderMessage } from "@/lib/builder";
import { db, schema } from "@/lib/db";
import { builderTurn } from "@/lib/builder";
import { handleError, jsonError } from "@/lib/http";

export const maxDuration = 300;

export async function POST(request: Request, ctx: RouteContext<"/api/personas/[id]/builder">) {
  try {
    const { id } = await ctx.params;
    const { text } = (await request.json().catch(() => ({}))) as { text?: string };
    if (!text?.trim()) return jsonError("Message is empty");
    const persona = await db.query.personas.findFirst({ where: eq(schema.personas.id, id) });
    if (!persona) return jsonError("Persona not found", 404);
    if (persona.status !== "draft") return jsonError("The ICP is locked once research has started.", 409);

    const history = persona.builderMessages as BuilderMessage[];
    const { messages, reply, icp } = await builderTurn(history, text.trim());
    await db
      .update(schema.personas)
      .set({
        builderMessages: messages,
        ...(icp ? { icp, name: icp.persona_name } : {}),
        updatedAt: new Date(),
      })
      .where(eq(schema.personas.id, id));
    return NextResponse.json({ reply, icp: icp ?? persona.icp });
  } catch (err) {
    return handleError(err);
  }
}
