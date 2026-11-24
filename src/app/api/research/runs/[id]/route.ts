import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { handleError, jsonError } from "@/lib/http";
import { researchApiAuthorized, researchContext, updateRun } from "@/lib/research-runs";

/** Routine-facing: what to research. Authenticated with RESEARCH_API_TOKEN, not a user session. */
export async function GET(request: Request, ctx: RouteContext<"/api/research/runs/[id]">) {
  if (!researchApiAuthorized(request)) return jsonError("Unauthorized", 401);
  try {
    const { id } = await ctx.params;
    const run = await db.query.researchRuns.findFirst({ where: eq(schema.researchRuns.id, id) });
    if (!run) return jsonError("Run not found", 404);
    if (run.status === "done" || run.status === "verifying") return jsonError(`Run is already ${run.status}`, 409);
    const context = await researchContext(run.personaId);
    if (!context) return jsonError("Persona has no confirmed setup", 409);
    if (run.status === "requested") {
      await updateRun(run.id, { status: "researching", detail: "Claude started researching" });
    }
    return NextResponse.json({ run_id: run.id, mode: run.mode, ...context });
  } catch (err) {
    return handleError(err);
  }
}
