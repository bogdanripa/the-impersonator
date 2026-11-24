import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { start } from "workflow/api";
import { db, schema } from "@/lib/db";
import { handleError, jsonError } from "@/lib/http";
import { researchApiAuthorized, updateRun } from "@/lib/research-runs";
import { SeedPersonaSchema } from "@/lib/seed";
import { importResearchWorkflow } from "@/workflows/research";

export const maxDuration = 60;

/**
 * Routine-facing: submit finished research (seed format). Nothing is trusted: the app re-fetches
 * every source and re-verifies every quote in a workflow before importing.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/research/runs/[id]/submit">) {
  if (!researchApiAuthorized(request)) return jsonError("Unauthorized", 401);
  try {
    const { id } = await ctx.params;
    const run = await db.query.researchRuns.findFirst({ where: eq(schema.researchRuns.id, id) });
    if (!run) return jsonError("Run not found", 404);
    if (run.status !== "requested" && run.status !== "researching") return jsonError(`Run is already ${run.status}`, 409);

    const parsed = SeedPersonaSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid research format", issues: parsed.error.issues.slice(0, 20) }, { status: 400 });
    }
    if (!parsed.data.sources.length) return jsonError("No sources submitted");

    await updateRun(id, { submission: parsed.data, status: "verifying", detail: "Submitted; verifying" });
    await start(importResearchWorkflow, [id, run.personaId]);
    return NextResponse.json({ ok: true, sources: parsed.data.sources.length }, { status: 202 });
  } catch (err) {
    return handleError(err);
  }
}
