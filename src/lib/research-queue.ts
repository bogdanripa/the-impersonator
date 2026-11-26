import { and, asc, eq, inArray, isNotNull } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { DeepResearchError, startDeepResearch } from "@/lib/deep-research";
import { logEvent } from "@/lib/events";

const ACTIVE_RUN = ["requested", "researching", "verifying"];
const BUSY: ("discovering" | "extracting" | "synthesizing")[] = ["discovering", "extracting", "synthesizing"];

/**
 * Starts the next queued persona if no Claude research is running. Cheap to call often:
 * after a run finishes or is cancelled, and whenever the persona list loads.
 */
export async function processResearchQueue() {
  if (!process.env.CLAUDE_ROUTINE_FIRE_URL || !process.env.CLAUDE_ROUTINE_TOKEN) return null;
  await failStalledRuns();
  const [active] = await db
    .select({ id: schema.researchRuns.id })
    .from(schema.researchRuns)
    .where(inArray(schema.researchRuns.status, ACTIVE_RUN))
    .limit(1);
  if (active) return null;
  const [busy] = await db.select({ id: schema.personas.id }).from(schema.personas).where(inArray(schema.personas.status, BUSY)).limit(1);
  if (busy) return null;

  const [next] = await db
    .select({ id: schema.personas.id })
    .from(schema.personas)
    .where(isNotNull(schema.personas.queuedAt))
    .orderBy(asc(schema.personas.queuedAt))
    .limit(1);
  if (!next) return null;

  // Claim it first so two concurrent callers can't both start it.
  const claimed = await db
    .update(schema.personas)
    .set({ queuedAt: null })
    .where(and(eq(schema.personas.id, next.id), isNotNull(schema.personas.queuedAt)))
    .returning({ id: schema.personas.id });
  if (!claimed.length) return null;
  try {
    return await startDeepResearch(next.id, { requestedBy: "research queue", origin: process.env.APP_URL ?? "" });
  } catch (err) {
    const message = err instanceof DeepResearchError ? err.message : (err as Error).message;
    await logEvent({ kind: "research.queue_start_failed", level: "error", message: `Couldn't start queued research: ${message}`, actor: "research queue", personaId: next.id });
    await db
      .update(schema.personas)
      .set({ status: "failed", statusDetail: `Couldn't start queued research: ${message}` })
      .where(eq(schema.personas.id, next.id));
    return null;
  }
}

const START_TIMEOUT_MS = 15 * 60_000;
const SILENCE_TIMEOUT_MS = 60 * 60_000;

/**
 * Routine sessions can die without telling us. A run that never started, or went silent, is
 * marked failed and its persona restored, so the queue can move on.
 */
async function failStalledRuns() {
  const runs = await db
    .select()
    .from(schema.researchRuns)
    .where(inArray(schema.researchRuns.status, ["requested", "researching"]));
  for (const run of runs) {
    const idle = Date.now() - new Date(run.updatedAt).getTime();
    const stalled = (run.status === "requested" && idle > START_TIMEOUT_MS) || (run.status === "researching" && idle > SILENCE_TIMEOUT_MS);
    if (!stalled) continue;
    await db
      .update(schema.researchRuns)
      .set({ status: "failed", detail: `Stalled: no word from Claude for ${Math.round(idle / 60_000)} minutes`, updatedAt: new Date() })
      .where(eq(schema.researchRuns.id, run.id));
    await db.update(schema.personaGaps).set({ status: "open", runId: null }).where(eq(schema.personaGaps.runId, run.id));
    await logEvent({
      kind: "research.stalled", level: "error",
      message: `Research run marked stalled: no word from Claude for ${Math.round(idle / 60_000)} minutes (${run.status})`,
      actor: "system", personaId: run.personaId, runId: run.id, data: { lastNote: run.detail, sessionUrl: run.sessionUrl },
    });
    const persona = await db.query.personas.findFirst({ where: eq(schema.personas.id, run.personaId) });
    if (persona && BUSY.includes(persona.status as (typeof BUSY)[number])) {
      await db
        .update(schema.personas)
        .set({
          status: persona.version > 0 ? "ready" : "failed",
          statusDetail:
            persona.version > 0
              ? "The update research stalled; this is still the previous version."
              : "Claude's research session stalled. Retry it from this page.",
        })
        .where(eq(schema.personas.id, persona.id));
    }
  }
}

/** Position in the queue (1-based) for each queued persona. */
export async function queuePositions(): Promise<Map<string, number>> {
  const rows = await db
    .select({ id: schema.personas.id })
    .from(schema.personas)
    .where(isNotNull(schema.personas.queuedAt))
    .orderBy(asc(schema.personas.queuedAt));
  return new Map(rows.map((r, i) => [r.id, i + 1]));
}
