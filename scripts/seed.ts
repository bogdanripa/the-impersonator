/**
 * Seeds researched personas from a local, git-ignored JSON file.
 * Every quote is re-verified against the page text before anything is written.
 * Usage: npm run seed -- seeds/<file>.json [--replace]
 */
import { eq } from "drizzle-orm";
import { db, schema } from "../src/lib/db";
import { checkSource, findExistingPersona, importSeedPersona, loadSeedFile } from "../src/lib/seed";

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error("Usage: npm run seed -- <seed.json> [--replace]");
  const replace = process.argv.includes("--replace");
  for (const seed of loadSeedFile(file)) {
    const existing = await findExistingPersona(seed.icp);
    if (existing.length && !replace) {
      console.log(`skip   ${seed.icp.persona_name} (exists; use --replace)`);
      continue;
    }
    for (const e of existing) await db.delete(schema.personas).where(eq(schema.personas.id, e.id));
    const checks = [];
    for (const s of seed.sources) checks.push(await checkSource(s, seed.icp));
    const res = await importSeedPersona(seed, checks);
    const persona = await db.query.personas.findFirst({ where: eq(schema.personas.id, res.id) });
    console.log(`${res.ok ? "create" : "FAILED"} ${seed.icp.persona_name} → /personas/${res.id}\n       ${persona?.statusDetail ?? ""}`);
  }
}

main().then(() => process.exit(0), (err) => {
  console.error(err);
  process.exit(1);
});
