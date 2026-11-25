import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { start } from "workflow/api";
import { db, schema } from "@/lib/db";
import { findPersona } from "@/lib/access";
import { handleError, jsonError } from "@/lib/http";
import { soulWorkflow } from "@/workflows/research";

/** (Re)writes the persona's soul from its current evidence. */
export async function POST(request: Request, ctx: RouteContext<"/api/personas/[id]/soul">) {
  try {
    const { id } = await ctx.params;
    const persona = await findPersona(request, id);
    if (!persona) return jsonError("Persona not found", 404);
    if (persona.version < 1) return jsonError("Research the persona first", 409);
    if (persona.soulStatus === "generating") return jsonError("The soul is already being written", 409);
    await db.update(schema.personas).set({ soulStatus: "generating", soulError: null }).where(eq(schema.personas.id, id));
    await start(soulWorkflow, [id]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}
