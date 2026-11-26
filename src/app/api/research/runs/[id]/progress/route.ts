import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { handleError, jsonError } from "@/lib/http";
import { logEvent } from "@/lib/events";
import { researchApiAuthorized, researchUnauthorized, updateRun } from "@/lib/research-runs";

/**
 * Routine-facing: a short progress note shown on the persona page, or (`kind: "problem"`) a problem
 * with the app or the tools, recorded for the team. Every note is kept in the activity log. Notes
 * after the run was submitted are logged without changing the run; a failed run says why.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/research/runs/[id]/progress">) {
  if (!researchApiAuthorized(request)) return researchUnauthorized(request);
  try {
    const { id } = await ctx.params;
    const { message, kind } = (await request.json().catch(() => ({}))) as { message?: string; kind?: string };
    if (!message?.trim()) return jsonError("message is required");
    const run = await db.query.researchRuns.findFirst({ where: eq(schema.researchRuns.id, id) });
    if (!run) return jsonError("Run not found", 404);
    const problem = kind === "problem";
    await logEvent({
      kind: problem ? "research.problem" : "research.progress",
      level: problem ? "warn" : "info",
      message: message.trim().slice(0, 2000),
      actor: "routine",
      personaId: run.personaId,
      runId: run.id,
      data: { runStatus: run.status },
    });
    if (run.status === "failed") {
      return jsonError(`Run is failed: ${run.detail ?? "no reason recorded"}. Stop working on it; a new run is needed.`, 409);
    }
    // Problems, and notes after submitting, are recorded but don't change what the page shows.
    if (problem || (run.status !== "requested" && run.status !== "researching")) return NextResponse.json({ ok: true, logged: true });
    const detail = message.trim().slice(0, 300);
    await updateRun(id, { status: "researching", detail });
    await db
      .update(schema.personas)
      .set({ statusDetail: `Claude: ${detail}`, updatedAt: new Date() })
      .where(eq(schema.personas.id, run.personaId));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}
