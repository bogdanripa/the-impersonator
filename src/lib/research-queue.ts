import { and, asc, eq, inArray, isNotNull } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { DeepResearchError, startDeepResearch } from "@/lib/deep-research";

const ACTIVE_RUN = ["requested", "researching", "verifying"];
const BUSY: ("discovering" | "extracting" | "synthesizing")[] = ["discovering", "extracting", "synthesizing"];

/**
 * Starts the next queued persona if no Claude research is running. Cheap to call often:
 * after a run finishes or is cancelled, and whenever the persona list loads.
 */
export async function processResearchQueue() {
  if (!process.env.CLAUDE_ROUTINE_FIRE_URL || !process.env.CLAUDE_ROUTINE_TOKEN) return null;
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
    await db
      .update(schema.personas)
      .set({ status: "failed", statusDetail: `Couldn't start queued research: ${message}` })
      .where(eq(schema.personas.id, next.id));
    return null;
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
