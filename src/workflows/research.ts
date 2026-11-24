import {
  approvedStep,
  discoverStep,
  extractStep,
  importRunStep,
  runSourceCountStep,
  runStatusStep,
  nextInQueueStep,
  soulStep,
  statusStep,
  synthesizeStep,
  verifyRunSourceStep,
} from "./steps";

/** Finds the person's own material and peer interviews, then hands over to the user for review. */
export async function discoverWorkflow(personaId: string) {
  "use workflow";
  try {
    const [anchor, company, peers] = await Promise.all([
      discoverStep(personaId, "anchor"),
      discoverStep(personaId, "company"),
      discoverStep(personaId, "peer"),
    ]);
    await statusStep(
      personaId,
      "reviewing",
      anchor + company + peers
        ? `Found ${anchor} sources by the person, ${company} company sources and ${peers} from peers. Review them before extraction.`
        : "No candidates found. Add source URLs manually.",
    );
  } catch (err) {
    await statusStep(personaId, "failed", `Discovery failed: ${(err as Error).message}`);
  }
}

/** Fetches + verifies every approved source in parallel, then synthesizes the persona. */
export async function extractWorkflow(personaId: string) {
  "use workflow";
  try {
    const ids = await approvedStep(personaId);
    await statusStep(personaId, "extracting", `Fetching and verifying ${ids.length} sources…`);
    await Promise.allSettled(ids.map((id) => extractStep(id)));
    await statusStep(personaId, "synthesizing", "Building the persona from verified evidence…");
    await synthesizeStep(personaId);
  } catch (err) {
    await statusStep(personaId, "failed", `Research failed: ${(err as Error).message}`);
    return;
  }
  await soulWithoutFailingPersona(personaId);
}

/**
 * Imports research submitted by the Claude routine. Every source is re-fetched by our server
 * and every quote re-verified (in parallel batches) before anything reaches the persona.
 */
export async function importResearchWorkflow(runId: string, personaId: string) {
  "use workflow";
  try {
    const count = await runSourceCountStep(runId);
    await runStatusStep(runId, "verifying", `Re-fetching and verifying ${count} sources…`);
    await statusStep(personaId, "extracting", `Verifying Claude's research: ${count} sources…`);
    const BATCH = 8;
    for (let start = 0; start < count; start += BATCH) {
      const batch = Array.from({ length: Math.min(BATCH, count - start) }, (_, i) => start + i);
      await Promise.allSettled(batch.map((i) => verifyRunSourceStep(runId, i)));
    }
    await statusStep(personaId, "synthesizing", "Building the persona from verified evidence…");
    await importRunStep(runId);
  } catch (err) {
    await runStatusStep(runId, "failed", (err as Error).message);
    await statusStep(personaId, "failed", `Importing research failed: ${(err as Error).message}`);
    await nextInQueueStep();
    return;
  }
  await soulWithoutFailingPersona(personaId);
  await nextInQueueStep();
}

/** Writes the persona's SOUL.md as its own step; failures are recorded and shown, not fatal. */
export async function soulWorkflow(personaId: string) {
  "use workflow";
  await soulWithoutFailingPersona(personaId);
}

async function soulWithoutFailingPersona(personaId: string) {
  try {
    await soulStep(personaId);
  } catch {
    // runSoul recorded the failure on the persona; the persona itself stays ready.
  }
}
