import { approvedStep, discoverStep, extractStep, statusStep, synthesizeStep } from "./steps";

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
  }
}
