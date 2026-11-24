/**
 * Updates an existing persona's card fields (photo, company domain/logo, tagline) from a seed
 * file, in place: evidence, versions and conversations are untouched.
 * The tagline is only applied when the persona already has an evidence-backed summary, since it
 * condenses that same summary.
 * Usage: npm run persona-meta -- seeds/<file>.json
 */
import { eq } from "drizzle-orm";
import { db, schema } from "../src/lib/db";
import { findExistingPersona, loadSeedFile } from "../src/lib/seed";
import { refreshPersonaMedia } from "../src/lib/media";

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error("Usage: npm run persona-meta -- <seed.json>");
  for (const seed of loadSeedFile(file)) {
    const [existing] = await findExistingPersona(seed.icp);
    if (!existing) {
      console.log(`skip   ${seed.icp.persona_name} (not found)`);
      continue;
    }
    const persona = await db.query.personas.findFirst({ where: eq(schema.personas.id, existing.id) });
    if (!persona?.icp) continue;
    const icp = {
      ...persona.icp,
      anchor_photo_url: seed.icp.anchor_photo_url,
      anchor_photo_page: seed.icp.anchor_photo_page,
      company_domain: seed.icp.company_domain,
    };
    const tagline = seed.synthesis.summary?.tagline?.trim();
    const words = tagline ? tagline.split(/\s+/).length : 0;
    const applyTagline = !!tagline && words <= 14 && !!persona.summary;
    await db
      .update(schema.personas)
      .set({ icp, ...(applyTagline ? { tagline } : {}) })
      .where(eq(schema.personas.id, persona.id));
    const media = await refreshPersonaMedia(persona.id);
    console.log(`update ${seed.icp.persona_name}: tagline ${applyTagline ? "set" : "skipped"}, photo ${media.photo}, logo ${media.logo}`);
  }
}

main().then(() => process.exit(0), (err) => {
  console.error(err);
  process.exit(1);
});
