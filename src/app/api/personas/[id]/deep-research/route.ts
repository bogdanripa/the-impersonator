import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { handleError, jsonError } from "@/lib/http";
import { appOrigin } from "@/lib/auth";
import { updateRun } from "@/lib/research-runs";
import { refreshPersonaMedia } from "@/lib/media";

export const maxDuration = 60;

/**
 * Starts (or refreshes) deep research for a persona by firing the Claude routine.
 * The routine receives only a run id and the app URL; it fetches the persona setup itself.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/personas/[id]/deep-research">) {
  try {
    const fireUrl = process.env.CLAUDE_ROUTINE_FIRE_URL;
    const token = process.env.CLAUDE_ROUTINE_TOKEN;
    if (!fireUrl || !token) return jsonError("The Claude research routine isn't configured (CLAUDE_ROUTINE_FIRE_URL / CLAUDE_ROUTINE_TOKEN).", 501);

    const { id } = await ctx.params;
    const persona = await db.query.personas.findFirst({ where: eq(schema.personas.id, id) });
    if (!persona) return jsonError("Persona not found", 404);
    if (!persona.icp) return jsonError("Confirm the persona setup first");
    if (["discovering", "extracting", "synthesizing"].includes(persona.status)) return jsonError("Research is already running", 409);

    const mode = persona.version > 0 ? "update" : "new";
    // An update applies the setup agreed in the update chat.
    if (mode === "update" && persona.pendingIcp) {
      await db
        .update(schema.personas)
        .set({ icp: persona.pendingIcp, name: persona.pendingIcp.persona_name, pendingIcp: null })
        .where(eq(schema.personas.id, id));
      await refreshPersonaMedia(id).catch(() => null);
    }
    const [run] = await db
      .insert(schema.researchRuns)
      .values({ personaId: id, mode, requestedBy: request.headers.get("x-user-email") })
      .returning();

    const res = await fetch(fireUrl, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({ text: JSON.stringify({ run_id: run.id, app_url: appOrigin(request.url), mode }) }),
      signal: AbortSignal.timeout(30_000),
    });
    const body = (await res.json().catch(() => ({}))) as { claude_code_session_url?: string; error?: { message?: string } };
    if (!res.ok) {
      await updateRun(run.id, { status: "failed", detail: `Routine fire failed (HTTP ${res.status})` });
      console.error("Routine fire failed", res.status, body);
      return jsonError(res.status === 429 ? "The research routine is rate limited. Try again later." : "Couldn't start the research routine.", 502);
    }

    await updateRun(run.id, { sessionUrl: body.claude_code_session_url ?? null, detail: "Routine started" });
    await db
      .update(schema.personas)
      .set({
        status: "discovering",
        statusDetail: mode === "update" ? "Claude is updating the research…" : "Claude is researching…",
        updatedAt: new Date(),
      })
      .where(eq(schema.personas.id, id));
    return NextResponse.json({ ok: true, runId: run.id, sessionUrl: body.claude_code_session_url ?? null });
  } catch (err) {
    return handleError(err);
  }
}
