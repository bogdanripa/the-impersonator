import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { start } from "workflow/api";
import { db, schema } from "@/lib/db";
import { handleError, jsonError } from "@/lib/http";
import { extractWorkflow } from "@/workflows/research";

/** Fetches and verifies approved sources, then builds the persona. */
export async function POST(_request: Request, ctx: RouteContext<"/api/personas/[id]/extract">) {
  try {
    const { id } = await ctx.params;
    const persona = await db.query.personas.findFirst({ where: eq(schema.personas.id, id) });
    if (!persona) return jsonError("Persona not found", 404);
    if (!["reviewing", "ready", "failed"].includes(persona.status)) return jsonError("Research is already running", 409);
    const approved = await db.query.sources.findFirst({
      where: and(eq(schema.sources.personaId, id), eq(schema.sources.status, "approved")),
    });
    if (!approved) return jsonError("Approve at least one source first");
    await db
      .update(schema.personas)
      .set({ status: "extracting", statusDetail: "Starting…", updatedAt: new Date() })
      .where(eq(schema.personas.id, id));
    await start(extractWorkflow, [id]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}
