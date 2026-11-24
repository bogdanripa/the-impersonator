import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { updateRun } from "@/lib/research-runs";
import { refreshPersonaMedia } from "@/lib/media";
import type { Icp } from "@/lib/types";

export class DeepResearchError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

/**
 * Fires the Claude research routine for a persona. The routine receives only a run id and the
 * app URL; it fetches the persona setup (including research_focus) itself.
 * `setup` replaces the persona's setup before the run (e.g. from an update chat or gaps).
 */
export async function startDeepResearch(personaId: string, opts: { requestedBy: string | null; origin: string; setup?: Icp }) {
  const fireUrl = process.env.CLAUDE_ROUTINE_FIRE_URL;
  const token = process.env.CLAUDE_ROUTINE_TOKEN;
  if (!fireUrl || !token) throw new DeepResearchError("The Claude research routine isn't configured.", 501);

  const persona = await db.query.personas.findFirst({ where: eq(schema.personas.id, personaId) });
  if (!persona) throw new DeepResearchError("Persona not found", 404);
  if (!persona.icp) throw new DeepResearchError("Confirm the persona setup first", 400);
  if (["discovering", "extracting", "synthesizing"].includes(persona.status)) throw new DeepResearchError("Research is already running", 409);

  const mode = persona.version > 0 ? "update" : "new";
  const setup = opts.setup ?? (mode === "update" ? persona.pendingIcp : null);
  if (setup) {
    await db
      .update(schema.personas)
      .set({ icp: setup, name: setup.persona_name, pendingIcp: null })
      .where(eq(schema.personas.id, personaId));
    await refreshPersonaMedia(personaId).catch(() => null);
  }
  const [run] = await db.insert(schema.researchRuns).values({ personaId, mode, requestedBy: opts.requestedBy }).returning();

  const res = await fetch(fireUrl, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ text: JSON.stringify({ run_id: run.id, app_url: opts.origin, mode }) }),
    signal: AbortSignal.timeout(30_000),
  });
  const body = (await res.json().catch(() => ({}))) as { claude_code_session_url?: string };
  if (!res.ok) {
    await updateRun(run.id, { status: "failed", detail: `Routine fire failed (HTTP ${res.status})` });
    console.error("Routine fire failed", res.status, body);
    throw new DeepResearchError(
      res.status === 429 ? "The research routine is rate limited. Try again later." : "Couldn't start the research routine.",
      502,
    );
  }
  await updateRun(run.id, { sessionUrl: body.claude_code_session_url ?? null, detail: "Routine started" });
  await db
    .update(schema.personas)
    .set({
      status: "discovering",
      statusDetail: mode === "update" ? "Claude is updating the research…" : "Claude is researching…",
      updatedAt: new Date(),
    })
    .where(eq(schema.personas.id, personaId));
  return { runId: run.id, sessionUrl: body.claude_code_session_url ?? null };
}
