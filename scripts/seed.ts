/**
 * Seeds personas from a local, git-ignored JSON file (an array of persona setups).
 * Usage: npm run seed -- seeds/personas.json
 */
import { readFileSync } from "node:fs";
import { and, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "../src/lib/db";
import { IcpSchema } from "../src/lib/types";

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error("Usage: npm run seed -- <path-to-seed.json>");
  const setups = z.array(IcpSchema).parse(JSON.parse(readFileSync(file, "utf8")));

  for (const icp of setups) {
    const existing = await db
      .select({ id: schema.personas.id })
      .from(schema.personas)
      .where(
        and(
          sql`lower(${schema.personas.icp}->>'anchor_name') = lower(${icp.anchor_name})`,
          sql`lower(${schema.personas.icp}->>'anchor_company') = lower(${icp.anchor_company})`,
        ),
      );
    if (existing.length) {
      console.log(`skip   ${icp.persona_name} (already exists)`);
      continue;
    }
    const [row] = await db
      .insert(schema.personas)
      .values({
        name: icp.persona_name,
        icp,
        createdBy: "seed",
        builderMessages: [
          { role: "assistant", content: "This persona was seeded. Review the setup, then confirm it to start research.", icp },
        ],
      })
      .returning({ id: schema.personas.id });
    console.log(`create ${icp.persona_name} → /personas/${row.id}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
