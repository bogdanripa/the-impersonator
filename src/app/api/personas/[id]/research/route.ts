import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { start } from "workflow/api";
import { db, schema } from "@/lib/db";
import { findPersona } from "@/lib/access";
import { handleError, jsonError } from "@/lib/http";
import { logEvent } from "@/lib/events";
import { missingAnchor } from "@/lib/types";
import { discoverWorkflow } from "@/workflows/research";

/** Confirms the ICP and starts discovery of real interviews. */
export async function POST(request: Request, ctx: RouteContext<"/api/personas/[id]/research">) {
  try {
    const { id } = await ctx.params;
    const persona = await findPersona(request, id);
    if (!persona) return jsonError("Persona not found", 404);
    if (!persona.icp) return jsonError("Define the ICP first");
    const missing = missingAnchor(persona.icp);
    if (missing.length) {
      const message = `Choose a real, named person to simulate first (missing: ${missing.join(", ")}).`;
      await logEvent({ kind: "research.refused", level: "warn", message: `Research not started: ${message}`, actor: request.headers.get("x-user-email"), personaId: id });
      return jsonError(message);
    }
    if (!["draft", "reviewing", "ready", "failed"].includes(persona.status)) {
      return jsonError("Research is already running", 409);
    }
    await db
      .update(schema.personas)
      .set({ status: "discovering", statusDetail: "Searching the web for real interviews…", updatedAt: new Date() })
      .where(eq(schema.personas.id, id));
    await start(discoverWorkflow, [id]);
    await logEvent({ kind: "research.started", message: `In-app research started for ${persona.icp.anchor_name}`, actor: request.headers.get("x-user-email"), personaId: id, data: { mode: "in-app" } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}
