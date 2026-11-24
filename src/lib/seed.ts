/**
 * Offline research import. Research can be done outside the app (e.g. by a researcher or an
 * agent), but it goes through the SAME guarantees as the in-app pipeline:
 * pages are read with our fetcher, every quote is verified verbatim against that text, the
 * speaker must be the right person, and the synthesis goes through planSynthesis' evidence rules.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { fetchSource } from "@/lib/fetch-source";
import { nameKey, normalize, verifyQuote } from "@/lib/verify";
import { IcpSchema, type Icp } from "@/lib/types";
import { companyMatches, planSynthesis, sameName, saveSynthesis } from "@/lib/research";

const Quote = { quote: z.string(), speaker: z.string() };

export const SeedSourceSchema = z.object({
  id: z.string(),
  url: z.string().url(),
  tier: z.enum(["anchor", "company", "peer"]),
  title: z.string().optional(),
  publisher: z.string().optional(),
  published_at: z.string().optional(),
  subject: z.object({
    name: z.string().describe("Person, or the company for company material"),
    role: z.string().optional(),
    organization: z.string().optional(),
    identity_quote: z.string().describe("Verbatim sentence from the page establishing who they are"),
  }),
  insights: z
    .array(z.object({ id: z.string(), kind: z.enum(schema.insightKind.enumValues), summary: z.string(), ...Quote }))
    .default([]),
  stories: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        situation: z.string(),
        action: z.string(),
        outcome: z.string(),
        lesson: z.string().optional(),
        ...Quote,
      }),
    )
    .default([]),
});

const Cites = { insight_ids: z.array(z.string()).default([]), story_ids: z.array(z.string()).default([]) };

/** Every URL looked at, used or not, so coverage can be audited. */
export const ConsideredSchema = z.object({
  url: z.string(),
  tier: z.enum(["anchor", "company", "peer"]).optional(),
  outcome: z.enum(["used", "paywalled", "blocked", "js_only", "audio_video_only", "wrong_person", "irrelevant", "duplicate", "too_old"]),
  note: z.string().optional(),
});

export const SeedPersonaSchema = z.object({
  icp: IcpSchema.extend({ research_focus: z.string().default("") }),
  sources: z.array(SeedSourceSchema),
  considered: z.array(ConsideredSchema).default([]),
  searches: z.array(z.string()).default([]).describe("Search queries run, for auditing coverage"),
  synthesis: z.object({
    summary: z.object({ text: z.string(), ...Cites }).optional(),
    elements: z.array(
      z.object({
        category: z.enum(schema.elementCategory.enumValues),
        title: z.string(),
        description: z.string(),
        disagreement: z.string().default(""),
        ...Cites,
      }),
    ),
    answers: z.array(
      z.object({ question: z.string(), status: z.enum(["answered", "partial", "unknown"]), answer: z.string().default(""), ...Cites }),
    ),
  }),
});
export type SeedPersona = z.infer<typeof SeedPersonaSchema>;
type SeedSource = z.infer<typeof SeedSourceSchema>;

export function loadSeedFile(file: string): SeedPersona[] {
  const raw = JSON.parse(readFileSync(file, "utf8"));
  return z.array(SeedPersonaSchema).parse(Array.isArray(raw) ? raw : [raw]);
}

const CACHE_DIR = path.resolve("seeds/cache");

/**
 * Text exactly as our fetcher reads it. Locally it's cached so research and import see identical
 * text; on the server (cache: false) every page is fetched fresh.
 */
export async function getSourceText(url: string, { refresh = false, cache = true } = {}) {
  if (!cache) {
    const fetched = await fetchSource(url);
    return { file: null as string | null, ...fetched };
  }
  mkdirSync(CACHE_DIR, { recursive: true });
  const file = path.join(CACHE_DIR, `${createHash("sha256").update(url).digest("hex").slice(0, 20)}.txt`);
  if (!refresh && existsSync(file)) {
    const text = readFileSync(file, "utf8");
    return { file, text, title: null as string | null, hash: createHash("sha256").update(text).digest("hex") };
  }
  const fetched = await fetchSource(url);
  writeFileSync(file, fetched.text);
  return { file, ...fetched };
}

export type SourceCheck = {
  source: SeedSource;
  text: string | null;
  hash: string | null;
  error: string | null;
  subjectOk: boolean;
  subjectReason: string | null;
  isAnchor: boolean;
  /** Verified item id → quote offset in the normalized text. Plain objects so checks serialize. */
  accepted: { insights: Record<string, number>; stories: Record<string, number> };
  rejected: { id: string; quote: string; reason: string }[];
};

export async function checkSource(source: SeedSource, icp: Icp, { cache = true } = {}): Promise<SourceCheck> {
  const result: SourceCheck = {
    source, text: null, hash: null, error: null, subjectOk: false, subjectReason: null, isAnchor: false,
    accepted: { insights: {}, stories: {} }, rejected: [],
  };
  try {
    const t = await getSourceText(source.url, { cache });
    result.text = t.text;
    result.hash = t.hash;
  } catch (err) {
    result.error = (err as Error).message;
    return result;
  }
  const norm = normalize(result.text!);
  const key = nameKey(source.subject.name);
  const isCompany = source.tier === "company";
  result.isAnchor = !isCompany && sameName(key, nameKey(icp.anchor_name));

  const identity = verifyQuote(norm, source.subject.identity_quote);
  if (!isCompany && !norm.includes(key)) result.subjectReason = `"${source.subject.name}" doesn't appear in the page text`;
  else if (!identity.ok) result.subjectReason = `Identity quote: ${identity.reason}`;
  else if (source.tier === "anchor" && !result.isAnchor) result.subjectReason = `Anchor source, but subject is ${source.subject.name}`;
  else if (source.tier === "peer" && sameName(key, nameKey(icp.anchor_name))) result.subjectReason = "Peer source is the anchor";
  else if (isCompany && !companyMatches(source.subject.name, icp.anchor_company)) result.subjectReason = `Not ${icp.anchor_company} material`;
  result.subjectOk = !result.subjectReason;
  if (!result.subjectOk) return result;

  // Company material may quote the company itself or a named person, but a named person must
  // actually appear in the page text: a quote can't be attributed to someone the page doesn't name.
  const speakerOk = (speaker: string) =>
    isCompany
      ? companyMatches(speaker, icp.anchor_company) || (nameKey(speaker).includes(" ") && norm.includes(nameKey(speaker)))
      : sameName(nameKey(speaker), key);
  for (const [kind, items] of [["insights", source.insights], ["stories", source.stories]] as const) {
    for (const item of items) {
      if (!speakerOk(item.speaker)) {
        result.rejected.push({
          id: item.id,
          quote: item.quote,
          reason: isCompany
            ? `Speaker "${item.speaker}" isn't ${icp.anchor_company} and isn't named in the page text`
            : `Spoken by "${item.speaker}", not ${source.subject.name}`,
        });
        continue;
      }
      const check = verifyQuote(norm, item.quote);
      if (!check.ok) result.rejected.push({ id: item.id, quote: item.quote, reason: check.reason });
      else result.accepted[kind][item.id] = check.offset;
    }
  }
  return result;
}

/** Dry-run of the synthesis rules over the verified evidence, without touching the database. */
export function simulateSynthesis(seed: SeedPersona, checks: SourceCheck[]) {
  const subjects = new Map<string, { id: string; isAnchor: boolean; kind: string }>();
  const iCode = new Map<string, { id: string; subjectId: string }>();
  const sCode = new Map<string, { id: string; subjectId: string }>();
  for (const c of checks) {
    if (!c.subjectOk) continue;
    const sid = c.source.tier === "company" ? `company:${nameKey(c.source.subject.name)}` : nameKey(c.source.subject.name);
    subjects.set(sid, { id: sid, isAnchor: c.isAnchor, kind: c.source.tier === "company" ? "company" : "person" });
    for (const id of Object.keys(c.accepted.insights)) iCode.set(id, { id, subjectId: sid });
    for (const id of Object.keys(c.accepted.stories)) sCode.set(id, { id, subjectId: sid });
  }
  return planSynthesis({
    persona: { id: "dry-run", version: 0, icp: seed.icp } as never,
    subjects: [...subjects.values()] as never,
    iCode: iCode as never,
    sCode: sCode as never,
    out: toSynthesisOutput(seed),
  });
}

function toSynthesisOutput(seed: SeedPersona) {
  const sum = seed.synthesis.summary;
  return {
    summary: sum ? { text: sum.text, insight_codes: sum.insight_ids, story_codes: sum.story_ids } : { text: "", insight_codes: [], story_codes: [] },
    elements: seed.synthesis.elements.map((e) => ({ ...e, insight_codes: e.insight_ids, story_codes: e.story_ids })),
    answers: seed.synthesis.answers.map((a) => ({ ...a, insight_codes: a.insight_ids, story_codes: a.story_ids })),
  };
}

export async function findExistingPersona(icp: Icp) {
  return db
    .select({ id: schema.personas.id })
    .from(schema.personas)
    .where(
      and(
        sql`lower(${schema.personas.icp}->>'anchor_name') = lower(${icp.anchor_name})`,
        sql`lower(${schema.personas.icp}->>'anchor_company') = lower(${icp.anchor_company})`,
      ),
    );
}

export function acceptedCount(c: SourceCheck) {
  return Object.keys(c.accepted.insights).length + Object.keys(c.accepted.stories).length;
}

/**
 * Imports one researched persona: verified evidence only, then the rule-checked synthesis.
 * With `personaId`, it updates that persona: its evidence is replaced and a new version is built.
 * (Conversations keep their persona version, but quotes that were dropped from the evidence
 * can no longer be shown on their older messages.)
 */
export async function importSeedPersona(seed: SeedPersona, checks: SourceCheck[], opts: { personaId?: string } = {}) {
  let persona: typeof schema.personas.$inferSelect;
  if (opts.personaId) {
    const existing = await db.query.personas.findFirst({ where: eq(schema.personas.id, opts.personaId) });
    if (!existing?.icp) throw new Error("Persona not found");
    await db.delete(schema.sources).where(eq(schema.sources.personaId, existing.id)); // cascades to insights/stories
    await db.delete(schema.subjects).where(eq(schema.subjects.personaId, existing.id));
    await db.delete(schema.rejections).where(eq(schema.rejections.personaId, existing.id));
    [persona] = await db
      .update(schema.personas)
      .set({ status: "synthesizing", statusDetail: "Importing verified research…", updatedAt: new Date() })
      .where(eq(schema.personas.id, existing.id))
      .returning();
  } else {
    const { icp } = seed;
    [persona] = await db
      .insert(schema.personas)
      .values({
        name: icp.persona_name,
        icp,
        status: "synthesizing",
        createdBy: "seed",
        builderMessages: [{ role: "assistant", content: "This persona was researched offline and seeded with verified evidence.", icp }],
      })
      .returning();
  }
  const icp = persona.icp!;

  const subjectIds = new Map<string, string>();
  const iCode = new Map<string, typeof schema.insights.$inferSelect>();
  const sCode = new Map<string, typeof schema.stories.$inferSelect>();

  for (const c of checks) {
    const s = c.source;
    const [row] = await db
      .insert(schema.sources)
      .values({
        personaId: persona.id, url: s.url, tier: s.tier, title: s.title ?? null, publisher: s.publisher ?? null,
        publishedAt: s.published_at ?? null, origin: "manual", claimedSubjectName: s.subject.name,
        claimedSubjectRole: [s.subject.role, s.subject.organization].filter(Boolean).join(", ") || null,
        fitReason: "Researched offline", contentText: c.text, contentHash: c.hash,
        fetchedAt: c.text ? new Date() : null,
        status: c.error ? "fetch_failed" : !c.subjectOk ? "no_evidence" : "extracted",
        error: c.error ?? c.subjectReason,
        acceptedCount: acceptedCount(c),
        rejectedCount: c.rejected.length,
      })
      .onConflictDoNothing()
      .returning();
    if (!row) continue; // duplicate URL in the research file
    if (c.rejected.length || c.subjectReason) {
      await db.insert(schema.rejections).values([
        ...(c.subjectReason ? [{ personaId: persona.id, sourceId: row.id, stage: "extraction", item: s.subject, reason: c.subjectReason }] : []),
        ...c.rejected.map((r) => ({ personaId: persona.id, sourceId: row.id, stage: "extraction", item: { id: r.id, quote: r.quote }, reason: r.reason })),
      ]);
    }
    if (!c.subjectOk) continue;

    const isCompany = s.tier === "company";
    const key = isCompany ? `company:${nameKey(s.subject.name)}` : nameKey(s.subject.name);
    let subjectId = subjectIds.get(key);
    if (!subjectId) {
      const [subject] = await db
        .insert(schema.subjects)
        .values({
          personaId: persona.id, name: s.subject.name, nameKey: key, role: s.subject.role ?? null,
          organization: s.subject.organization ?? null, identityQuote: s.subject.identity_quote,
          identitySourceId: row.id, isAnchor: c.isAnchor, kind: isCompany ? "company" : "person",
        })
        .returning();
      subjectId = subject.id;
      subjectIds.set(key, subjectId);
    }
    await db.update(schema.sources).set({ subjectId }).where(eq(schema.sources.id, row.id));

    for (const i of s.insights) {
      const offset = c.accepted.insights[i.id];
      if (offset === undefined) continue;
      const [ins] = await db
        .insert(schema.insights)
        .values({ personaId: persona.id, sourceId: row.id, subjectId, kind: i.kind, summary: i.summary, quote: i.quote, quoteOffset: offset })
        .returning();
      iCode.set(i.id, ins);
    }
    for (const st of s.stories) {
      const offset = c.accepted.stories[st.id];
      if (offset === undefined) continue;
      const [story] = await db
        .insert(schema.stories)
        .values({
          personaId: persona.id, sourceId: row.id, subjectId, title: st.title, situation: st.situation,
          action: st.action, outcome: st.outcome, lesson: st.lesson || null, quote: st.quote, quoteOffset: offset,
        })
        .returning();
      sCode.set(st.id, story);
    }
  }

  // Keep the full research inventory: pages looked at but not used, and why.
  const used = new Set(seed.sources.map((s) => s.url));
  const unreadable = new Set(["paywalled", "blocked", "js_only", "audio_video_only"]);
  const skipped = [...new Map(seed.considered.filter((c) => c.outcome !== "used" && !used.has(c.url)).map((c) => [c.url, c])).values()];
  if (skipped.length) {
    await db
      .insert(schema.sources)
      .values(
        skipped.map((c) => ({
          personaId: persona.id, url: c.url, tier: c.tier ?? "peer", origin: "manual",
          fitReason: "Considered during offline research",
          status: unreadable.has(c.outcome) ? ("fetch_failed" as const) : ("rejected" as const),
          error: `${c.outcome.replace(/_/g, " ")}${c.note ? `: ${c.note}` : ""}`,
        })),
      )
      .onConflictDoNothing();
  }

  const subjects = await db.select().from(schema.subjects).where(eq(schema.subjects.personaId, persona.id));
  if (!subjects.some((s) => s.isAnchor)) {
    await db
      .update(schema.personas)
      .set({ status: "failed", statusDetail: `No verified material from ${icp.anchor_name}.` })
      .where(eq(schema.personas.id, persona.id));
    return { id: persona.id, ok: false };
  }
  await saveSynthesis({ persona, subjects, iCode, sCode, out: toSynthesisOutput(seed) });
  return { id: persona.id, ok: true };
}
