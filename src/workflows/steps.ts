import { FatalError } from "workflow";
import {
  extractSource,
  listApprovedSourceIds,
  runDiscovery,
  setStatus,
  synthesize,
  type Tier,
} from "@/lib/research";
import { importRun, runSourceCount, updateRun, verifyRunSource } from "@/lib/research-runs";

export async function discoverStep(personaId: string, tier: Tier) {
  "use step";
  return runDiscovery(personaId, tier);
}
discoverStep.maxRetries = 1;

export async function approvedStep(personaId: string) {
  "use step";
  const ids = await listApprovedSourceIds(personaId);
  if (!ids.length) throw new FatalError("No approved sources");
  return ids;
}

export async function extractStep(sourceId: string) {
  "use step";
  await extractSource(sourceId);
}
extractStep.maxRetries = 2;

export async function synthesizeStep(personaId: string) {
  "use step";
  await synthesize(personaId);
}
synthesizeStep.maxRetries = 1;

export async function statusStep(personaId: string, status: Parameters<typeof setStatus>[1], detail: string) {
  "use step";
  await setStatus(personaId, status, detail);
}

// ---- Claude routine research import ----

export async function runSourceCountStep(runId: string) {
  "use step";
  return runSourceCount(runId);
}

export async function verifyRunSourceStep(runId: string, index: number) {
  "use step";
  await verifyRunSource(runId, index);
}
verifyRunSourceStep.maxRetries = 2;

export async function importRunStep(runId: string) {
  "use step";
  await importRun(runId);
}
importRunStep.maxRetries = 1;

export async function runStatusStep(runId: string, status: string, detail: string) {
  "use step";
  await updateRun(runId, { status, detail });
}
