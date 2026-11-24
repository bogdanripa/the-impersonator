import { NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { handleError, jsonError } from "@/lib/http";
import { appOrigin } from "@/lib/auth";
import { DeepResearchError, startDeepResearch } from "@/lib/deep-research";

export const maxDuration = 60;

/** Sends all open gaps to a focused Claude update run. */
export async function POST(request: Request, ctx: RouteContext<"/api/personas/[id]/gaps/research">) {
  try {
    const { id } = await ctx.params;
    const persona = await db.query.personas.findFirst({ where: eq(schema.personas.id, id) });
    if (!persona?.icp) return jsonError("Persona not found", 404);
    if (persona.version < 1) return jsonError("Research the persona first", 409);
    const open = await db
      .select()
      .from(schema.personaGaps)
      .where(and(eq(schema.personaGaps.personaId, id), eq(schema.personaGaps.status, "open")));
    if (!open.length) return jsonError("There are no open gaps");

    const questions = [...new Set(open.map((g) => g.question.trim()))].slice(0, 30);
    const focus = `Fill gaps the team hit in conversations. Find public material where ${persona.icp.anchor_name} (or ${persona.icp.anchor_company}) addresses these questions; if nothing public exists, log what you searched:\n${questions.map((q) => `- ${q}`).join("\n")}`;
    const res = await startDeepResearch(id, {
      requestedBy: request.headers.get("x-user-email"),
      origin: appOrigin(request.url),
      setup: { ...persona.icp, research_focus: focus },
    });
    await db
      .update(schema.personaGaps)
      .set({ status: "researching", runId: res.runId })
      .where(inArray(schema.personaGaps.id, open.map((g) => g.id)));
    return NextResponse.json({ ok: true, gaps: open.length, ...res });
  } catch (err) {
    if (err instanceof DeepResearchError) return jsonError(err.message, err.status);
    return handleError(err);
  }
}
