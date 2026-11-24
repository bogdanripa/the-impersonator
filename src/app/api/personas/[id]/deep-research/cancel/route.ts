import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { handleError, jsonError } from "@/lib/http";
import { latestRun, updateRun } from "@/lib/research-runs";
import { processResearchQueue } from "@/lib/research-queue";

/**
 * Cancels a stalled or failed routine run and puts the persona back where it was:
 * the setup chat for a new persona, or its current version for an update.
 * A late submission from the cancelled run is rejected (the run is no longer active).
 */
export async function POST(request: Request, ctx: RouteContext<"/api/personas/[id]/deep-research/cancel">) {
  try {
    const { id } = await ctx.params;
    const persona = await db.query.personas.findFirst({ where: eq(schema.personas.id, id) });
    if (!persona) return jsonError("Persona not found", 404);
    const run = await latestRun(id);
    if (run && ["requested", "researching"].includes(run.status)) {
      await updateRun(run.id, { status: "failed", detail: `Cancelled by ${request.headers.get("x-user-email") ?? "a user"}` });
      await db.update(schema.personaGaps).set({ status: "open", runId: null }).where(eq(schema.personaGaps.runId, run.id));
    } else if (run?.status === "verifying") {
      return jsonError("Claude's research is being verified and imported; it can't be cancelled now.", 409);
    }
    const back = persona.version > 0 ? "ready" : "draft";
    await db
      .update(schema.personas)
      .set({
        status: back,
        queuedAt: null,
        statusDetail: back === "ready" ? "Update cancelled; this is still the previous version." : "Research cancelled. Adjust the setup or try again.",
        updatedAt: new Date(),
      })
      .where(eq(schema.personas.id, id));
    await processResearchQueue().catch(() => null);
    return NextResponse.json({ ok: true, status: back });
  } catch (err) {
    return handleError(err);
  }
}
