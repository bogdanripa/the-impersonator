import { and, asc, desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { checkSource, importSeedPersona, SeedPersonaSchema, type SourceCheck } from "@/lib/seed";
import { timingSafeEqual } from "@/lib/auth";

/** Bearer-token check for the routine-facing API (RESEARCH_API_TOKEN). */
export function researchApiAuthorized(request: Request): boolean {
  const expected = process.env.RESEARCH_API_TOKEN;
  if (!expected || expected.length < 32) return false;
  const header = request.headers.get("authorization") ?? "";
  const given = header.startsWith("Bearer ") ? header.slice(7) : "";
  return timingSafeEqual(given, expected);
}

export async function latestRun(personaId: string) {
  return db.query.researchRuns.findFirst({
    where: eq(schema.researchRuns.personaId, personaId),
    orderBy: desc(schema.researchRuns.createdAt),
  });
}

export async function updateRun(runId: string, set: Partial<typeof schema.researchRuns.$inferInsert>) {
  await db
    .update(schema.researchRuns)
    .set({ ...set, updatedAt: new Date() })
    .where(eq(schema.researchRuns.id, runId));
}

/** Everything the routine needs to research a persona (or update one). */
export async function researchContext(personaId: string) {
  const persona = await db.query.personas.findFirst({ where: eq(schema.personas.id, personaId) });
  if (!persona?.icp) return null;
  const sources = await db
    .select({ url: schema.sources.url, tier: schema.sources.tier, status: schema.sources.status, error: schema.sources.error })
    .from(schema.sources)
    .where(eq(schema.sources.personaId, personaId));
  return { persona_id: persona.id, version: persona.version, icp: persona.icp, known_sources: sources };
}

// ---- Server-side verification + import (called from workflow steps) ----

async function loadRun(runId: string) {
  const run = await db.query.researchRuns.findFirst({ where: eq(schema.researchRuns.id, runId) });
  if (!run) throw new Error("Research run not found");
  const persona = await db.query.personas.findFirst({ where: eq(schema.personas.id, run.personaId) });
  if (!persona?.icp) throw new Error("Persona not found");
  const seed = SeedPersonaSchema.parse(run.submission);
  // The persona's confirmed setup wins over whatever the routine sent back.
  return { run, persona, seed: { ...seed, icp: persona.icp } };
}

export async function runSourceCount(runId: string) {
  const { seed } = await loadRun(runId);
  return seed.sources.length;
}

/** Re-fetches one submitted source with our fetcher and verifies every quote in it. */
export async function verifyRunSource(runId: string, index: number) {
  const { seed } = await loadRun(runId);
  const check = await checkSource(seed.sources[index], seed.icp, { cache: false });
  await db
    .insert(schema.researchChecks)
    .values({ runId, sourceIndex: index, result: check })
    .onConflictDoUpdate({ target: [schema.researchChecks.runId, schema.researchChecks.sourceIndex], set: { result: check } });
}

export async function importRun(runId: string) {
  const { run, persona, seed } = await loadRun(runId);
  const rows = await db
    .select()
    .from(schema.researchChecks)
    .where(and(eq(schema.researchChecks.runId, runId)))
    .orderBy(asc(schema.researchChecks.sourceIndex));
  const checks = rows.map((r) => r.result as SourceCheck);
  const res = await importSeedPersona(seed, checks, { personaId: persona.id });
  const after = await db.query.personas.findFirst({ where: eq(schema.personas.id, persona.id) });
  await updateRun(run.id, { status: res.ok ? "done" : "failed", detail: after?.statusDetail ?? null });
}
