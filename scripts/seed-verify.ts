/**
 * Dry run: checks a researched seed file exactly like the importer would, without a database.
 * Usage: npm run seed:verify -- seeds/<file>.json
 */
import { acceptedCount, checkSource, loadSeedFile, simulateSynthesis, type SourceCheck } from "../src/lib/seed";

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error("Usage: npm run seed:verify -- <seed.json>");
  let problems = 0;
  for (const seed of loadSeedFile(file)) {
    console.log(`\n=== ${seed.icp.persona_name}`);
    const checks: SourceCheck[] = [];
    for (const s of seed.sources) {
      const c = await checkSource(s, seed.icp);
      checks.push(c);
      const n = acceptedCount(c);
      const tag = c.error ? `FETCH FAILED: ${c.error}` : !c.subjectOk ? `SUBJECT REJECTED: ${c.subjectReason}` : `${n} verified, ${c.rejected.length} rejected`;
      console.log(`[${s.id}] ${s.tier.padEnd(7)} ${s.subject.name} | ${tag} | ${s.url}`);
      for (const r of c.rejected) console.log(`    ✕ ${r.id}: ${r.reason} — "${r.quote.slice(0, 90)}"`);
      problems += c.rejected.length + (c.subjectOk ? 0 : 1);
    }
    const plan = simulateSynthesis(seed, checks);
    console.log(`\nCard: ${plan.summary ? plan.summary.text : "NO VALID SUMMARY (needs anchor/company citations)"}`);
    if (!plan.summary) problems++;
    console.log(`Synthesis: ${plan.keep.length} elements kept, ${plan.dropped.length} dropped`);
    for (const d of plan.dropped) console.log(`    ✕ ${(d.item as { title?: string; question?: string }).title ?? (d.item as { question?: string }).question}: ${d.reason}`);
    for (const a of plan.answers) console.log(`    ? ${a.status.toUpperCase().padEnd(8)} ${a.question}`);
    // Coverage report: what the verified evidence actually covers.
    const ok = checks.filter((c) => c.subjectOk);
    const tierOf = (c: (typeof checks)[number]) => (c.isAnchor ? "anchor" : c.source.tier === "company" ? "company" : "peer");
    const byTier: Record<string, { sources: number; quotes: number; stories: number }> = {};
    const kinds: Record<string, Record<string, number>> = {};
    const peers = new Set<string>();
    for (const c of ok) {
      const t = tierOf(c);
      byTier[t] ??= { sources: 0, quotes: 0, stories: 0 };
      byTier[t].sources++;
      byTier[t].quotes += Object.keys(c.accepted.insights).length;
      byTier[t].stories += Object.keys(c.accepted.stories).length;
      if (t === "peer") peers.add(c.source.subject.name.toLowerCase());
      for (const i of c.source.insights) {
        if (!(i.id in c.accepted.insights)) continue;
        kinds[i.kind] ??= {};
        kinds[i.kind][t] = (kinds[i.kind][t] ?? 0) + 1;
      }
    }
    console.log("\nCoverage by tier:");
    for (const [t, v] of Object.entries(byTier)) console.log(`    ${t.padEnd(8)} ${v.sources} sources, ${v.quotes} quotes, ${v.stories} stories`);
    console.log(`    distinct peers: ${peers.size}`);
    console.log("Verified quotes by kind (anchor/company/peer):");
    for (const [k, v] of Object.entries(kinds).sort()) console.log(`    ${k.padEnd(17)} ${v.anchor ?? 0}/${v.company ?? 0}/${v.peer ?? 0}`);
    const outcomes: Record<string, number> = {};
    for (const c of seed.considered) outcomes[c.outcome] = (outcomes[c.outcome] ?? 0) + 1;
    console.log(`Inventory: ${seed.considered.length} URLs considered ${JSON.stringify(outcomes)}, ${seed.searches.length} searches logged`);
    problems += plan.dropped.length;
  }
  console.log(problems ? `\n${problems} problem(s) found.` : "\nAll clear.");
}

main().then(() => process.exit(0), (err) => {
  console.error(err);
  process.exit(1);
});
