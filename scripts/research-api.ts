/**
 * Helper for the Claude research routine to talk to the app's research API.
 *
 *   npm run research-api -- context  <run_id>                  → writes seeds/run-<run_id>.context.json
 *   npm run research-api -- progress <run_id> "<message>"
 *   npm run research-api -- submit   <run_id> <seed-file.json>
 *
 * The app URL comes from RESEARCH_APP_URL (set in the routine's environment), never from the
 * fire payload. Auth: the routine environment's network secret adds the Authorization header
 * for that host; RESEARCH_API_TOKEN is used instead when set (e.g. local testing).
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

async function call(path: string, init?: { method?: string; body?: unknown }) {
  const base = process.env.RESEARCH_APP_URL?.replace(/\/$/, "");
  if (!base) throw new Error("RESEARCH_APP_URL is not set");
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (process.env.RESEARCH_API_TOKEN) headers.authorization = `Bearer ${process.env.RESEARCH_API_TOKEN}`;
  const res = await fetch(`${base}${path}`, {
    method: init?.method ?? "GET",
    headers,
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 2000)}`);
  return text ? JSON.parse(text) : {};
}

async function main() {
  const [cmd, runId, arg] = process.argv.slice(2);
  if (!cmd || !runId || !/^[0-9a-f-]{36}$/.test(runId)) {
    throw new Error("Usage: research-api <context|progress|submit> <run_id> [message|file]");
  }
  if (cmd === "context") {
    const ctx = await call(`/api/research/runs/${runId}`);
    mkdirSync("seeds", { recursive: true });
    const file = `seeds/run-${runId}.context.json`;
    writeFileSync(file, JSON.stringify(ctx, null, 2));
    console.log(`Wrote ${file} (mode: ${ctx.mode}, persona: ${ctx.icp?.persona_name})`);
  } else if (cmd === "progress") {
    if (!arg) throw new Error("progress needs a message");
    await call(`/api/research/runs/${runId}/progress`, { method: "POST", body: { message: arg } });
    console.log("ok");
  } else if (cmd === "submit") {
    if (!arg) throw new Error("submit needs a seed file");
    const raw = JSON.parse(readFileSync(arg, "utf8"));
    const persona = Array.isArray(raw) ? raw[0] : raw;
    const res = await call(`/api/research/runs/${runId}/submit`, { method: "POST", body: persona });
    console.log(`Submitted ${res.sources} sources. The app will re-verify everything before import.`);
  } else {
    throw new Error(`Unknown command: ${cmd}`);
  }
}

main().then(() => process.exit(0), (err) => {
  console.error(`FAILED: ${(err as Error).message}`);
  process.exit(1);
});
