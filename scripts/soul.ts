/**
 * (Re)generates the SOUL.md for existing personas from their verified evidence.
 * Usage: npm run soul -- <personaId|all>
 */
import { gt } from "drizzle-orm";
import { db, schema } from "../src/lib/db";
import { runSoul } from "../src/lib/soul";

async function main() {
  const target = process.argv[2];
  if (!target) throw new Error("Usage: npm run soul -- <personaId|all>");
  const personas =
    target === "all"
      ? await db.select({ id: schema.personas.id, name: schema.personas.name }).from(schema.personas).where(gt(schema.personas.version, 0))
      : [{ id: target, name: target }];
  for (const p of personas) {
    try {
      const res = await runSoul(p.id);
      console.log(`${res ? "soul  " : "skip  "} ${p.name}${res ? `: ${res.sections} sections, ${res.phrases} signature phrases` : " (no anchor evidence)"}`);
    } catch (err) {
      console.log(`FAILED ${p.name}: ${(err as Error).message}`);
    }
  }
}

main().then(() => process.exit(0), (err) => {
  console.error(err);
  process.exit(1);
});
