import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { handleError, jsonError } from "@/lib/http";

/** Starts a new conversation. Each one starts fresh, with no memory of others. */
export async function POST(request: Request, ctx: RouteContext<"/api/personas/[id]/conversations">) {
  try {
    const { id } = await ctx.params;
    const persona = await db.query.personas.findFirst({ where: eq(schema.personas.id, id) });
    if (!persona) return jsonError("Persona not found", 404);
    if (persona.version < 1) return jsonError("This persona isn't ready yet", 409);
    const [row] = await db
      .insert(schema.conversations)
      .values({ personaId: id, personaVersion: persona.version, createdBy: request.headers.get("x-user-email") })
      .returning({ id: schema.conversations.id });
    return NextResponse.json({ id: row.id });
  } catch (err) {
    return handleError(err);
  }
}
