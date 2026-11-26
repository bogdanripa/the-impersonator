import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { start } from "workflow/api";
import { db, schema } from "@/lib/db";
import { handleError, jsonError } from "@/lib/http";
import { logEvent } from "@/lib/events";
import { researchApiAuthorized, researchUnauthorized, updateRun } from "@/lib/research-runs";
import { SeedPersonaSchema } from "@/lib/seed";
import { importResearchWorkflow } from "@/workflows/research";

export const maxDuration = 60;

/**
 * Routine-facing: submit finished research (seed format). Nothing is trusted: the app re-fetches
 * every source and re-verifies every quote in a workflow before importing.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/research/runs/[id]/submit">) {
  if (!researchApiAuthorized(request)) return researchUnauthorized(request);
  try {
    const { id } = await ctx.params;
    const run = await db.query.researchRuns.findFirst({ where: eq(schema.researchRuns.id, id) });
    if (!run) return jsonError("Run not found", 404);
    if (run.status === "failed") return jsonError(`Run is failed: ${run.detail ?? "no reason recorded"}. It can't take a submission; a new run is needed.`, 409);
    if (run.status !== "requested" && run.status !== "researching") return jsonError(`Run is already ${run.status}`, 409);

    const parsed = SeedPersonaSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      await logEvent({ kind: "research.submit_invalid", level: "warn", message: "Submitted research didn't match the format", actor: "routine", personaId: run.personaId, runId: id, data: { issues: parsed.error.issues.slice(0, 20) } });
      return NextResponse.json({ error: "Invalid research format", issues: parsed.error.issues.slice(0, 20) }, { status: 400 });
    }
    if (!parsed.data.sources.length) return jsonError("No sources submitted");

    await updateRun(id, { submission: parsed.data, status: "verifying", detail: "Submitted; verifying" });
    const tiers = parsed.data.sources.reduce<Record<string, number>>((m, s) => ((m[s.tier] = (m[s.tier] ?? 0) + 1), m), {});
    await logEvent({
      kind: "research.submitted",
      message: `Claude submitted ${parsed.data.sources.length} sources (${Object.entries(tiers).map(([t, n]) => `${n} ${t}`).join(", ")})`,
      actor: "routine",
      personaId: run.personaId,
      runId: id,
      durationMs: Date.now() - new Date(run.createdAt).getTime(),
      data: {
        tiers,
        quotes: parsed.data.sources.reduce((n, s) => n + s.insights.length + s.stories.length, 0),
        considered: parsed.data.considered.length,
        searches: parsed.data.searches.length,
        elements: parsed.data.synthesis.elements.length,
        answers: parsed.data.synthesis.answers.map((a) => ({ question: a.question, status: a.status })),
      },
    });
    await start(importResearchWorkflow, [id, run.personaId]);
    return NextResponse.json({ ok: true, sources: parsed.data.sources.length }, { status: 202 });
  } catch (err) {
    return handleError(err);
  }
}
