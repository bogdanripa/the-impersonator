import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { handleError, jsonError } from "@/lib/http";
import { researchApiAuthorized, updateRun } from "@/lib/research-runs";

/** Routine-facing: a short progress note shown on the persona page. */
export async function POST(request: Request, ctx: RouteContext<"/api/research/runs/[id]/progress">) {
  if (!researchApiAuthorized(request)) return jsonError("Unauthorized", 401);
  try {
    const { id } = await ctx.params;
    const { message } = (await request.json().catch(() => ({}))) as { message?: string };
    if (!message?.trim()) return jsonError("message is required");
    const run = await db.query.researchRuns.findFirst({ where: eq(schema.researchRuns.id, id) });
    if (!run) return jsonError("Run not found", 404);
    if (run.status !== "requested" && run.status !== "researching") return jsonError(`Run is ${run.status}`, 409);
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
