import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { start } from "workflow/api";
import { db, schema } from "@/lib/db";
import { findPersona } from "@/lib/access";
import { handleError, jsonError } from "@/lib/http";
import { discoverWorkflow } from "@/workflows/research";

/** Confirms the ICP and starts discovery of real interviews. */
export async function POST(request: Request, ctx: RouteContext<"/api/personas/[id]/research">) {
  try {
    const { id } = await ctx.params;
    const persona = await findPersona(request, id);
    if (!persona) return jsonError("Persona not found", 404);
    if (!persona.icp) return jsonError("Define the ICP first");
    if (!["draft", "reviewing", "ready", "failed"].includes(persona.status)) {
      return jsonError("Research is already running", 409);
    }
    await db
      .update(schema.personas)
      .set({ status: "discovering", statusDetail: "Searching the web for real interviews…", updatedAt: new Date() })
      .where(eq(schema.personas.id, id));
    await start(discoverWorkflow, [id]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}
