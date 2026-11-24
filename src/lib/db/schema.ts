import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { Icp } from "@/lib/types";

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const personaStatus = pgEnum("persona_status", [
  "draft", // ICP builder chat in progress
  "discovering", // searching for real interviews
  "reviewing", // user reviews candidate sources
  "extracting", // fetching + verified extraction
  "synthesizing", // building traits/beliefs/history from verified evidence
  "ready",
  "failed",
]);

/** A persona: a composite archetype built only from verified evidence. */
export const personas = pgTable("personas", {
  id: id(),
  name: text("name").notNull().default("Untitled persona"),
  status: personaStatus("status").notNull().default("draft"),
  statusDetail: text("status_detail"),
  icp: jsonb("icp").$type<Icp>(),
  /** Revised setup from an update chat; applied only when the update research is launched. */
  pendingIcp: jsonb("pending_icp").$type<Icp>(),
  /** Transcript of the ICP builder chat (replayed to the model each turn). */
  builderMessages: jsonb("builder_messages").$type<unknown[]>().notNull().default([]),
  /** Incremented every time the persona is re-synthesized. */
  version: integer("version").notNull().default(0),
  /** Persona-card description. Only set when it cites the anchor's or company's own evidence. */
  summary: text("summary"),
  /** SOUL.md generation for the current version: pending | generating | ready | failed. */
  soulStatus: text("soul_status"),
  soulError: text("soul_error"),
  /** One-line version of the summary for cards (same evidence rules). */
  tagline: text("tagline"),
  /** Official headshot and company logo, stored so cards don't depend on third-party hosts. */
  photoData: text("photo_data"),
  photoType: text("photo_type"),
  photoSourceUrl: text("photo_source_url"),
  logoData: text("logo_data"),
  logoType: text("logo_type"),
  summaryInsightIds: jsonb("summary_insight_ids").$type<string[]>().notNull().default([]),
  summaryStoryIds: jsonb("summary_story_ids").$type<string[]>().notNull().default([]),
  createdBy: text("created_by"),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** A real person whose public words are used as evidence. Never chatted with directly. */
export const subjects = pgTable(
  "subjects",
  {
    id: id(),
    personaId: uuid("persona_id").notNull().references(() => personas.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    nameKey: text("name_key").notNull(),
    role: text("role"),
    organization: text("organization"),
    /** Verbatim quote from a source that establishes who they are (role/company). */
    identityQuote: text("identity_quote"),
    identitySourceId: uuid("identity_source_id"),
    /** person, or company for official company material (filings, earnings calls, press releases, job posts). */
    kind: text("kind").notNull().default("person"),
    /** The real person being simulated. Everyone else is a peer used as supplementary evidence. */
    isAnchor: boolean("is_anchor").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("subjects_persona_name").on(t.personaId, t.nameKey)],
);

export const sourceStatus = pgEnum("source_status", [
  "candidate",
  "approved",
  "rejected",
  "fetch_failed",
  "extracted",
  "no_evidence",
]);

/** A public interview/article/transcript. Full text is stored so every quote can be re-verified. */
export const sources = pgTable(
  "sources",
  {
    id: id(),
    personaId: uuid("persona_id").notNull().references(() => personas.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    title: text("title"),
    publisher: text("publisher"),
    publishedAt: text("published_at"),
    origin: text("origin").notNull().default("discovered"), // discovered | manual
    /** anchor = by/with the person being simulated; company = about the anchor's company; peer = a similar person. */
    tier: text("tier").notNull().default("peer"),
    /** Who discovery *claims* is interviewed. Unverified until extraction confirms it. */
    claimedSubjectName: text("claimed_subject_name"),
    claimedSubjectRole: text("claimed_subject_role"),
    fitReason: text("fit_reason"),
    fitScore: integer("fit_score"),
    status: sourceStatus("status").notNull().default("candidate"),
    subjectId: uuid("subject_id").references(() => subjects.id, { onDelete: "set null" }),
    contentText: text("content_text"),
    contentHash: text("content_hash"),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }),
    error: text("error"),
    acceptedCount: integer("accepted_count").notNull().default(0),
    rejectedCount: integer("rejected_count").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    index("sources_persona").on(t.personaId),
    uniqueIndex("sources_persona_url").on(t.personaId, t.url),
  ],
);

export const insightKind = pgEnum("insight_kind", [
  "belief",
  "opinion",
  "budget",
  "responsibility",
  "team_structure",
  "pain_point",
  "goal",
  "behavior",
  "decision_process",
  "objection",
  "trait",
  "language",
  "history",
]);

/** A verified, verbatim quote from a subject, with what it shows. */
export const insights = pgTable(
  "insights",
  {
    id: id(),
    personaId: uuid("persona_id").notNull().references(() => personas.id, { onDelete: "cascade" }),
    sourceId: uuid("source_id").notNull().references(() => sources.id, { onDelete: "cascade" }),
    subjectId: uuid("subject_id").notNull().references(() => subjects.id, { onDelete: "cascade" }),
    kind: insightKind("kind").notNull(),
    summary: text("summary").notNull(),
    quote: text("quote").notNull(),
    /** Character offset of the quote in the source's normalized text. */
    quoteOffset: integer("quote_offset").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("insights_persona").on(t.personaId)],
);

/** A real anecdote told by a subject, backed by a verified verbatim quote. */
export const stories = pgTable(
  "stories",
  {
    id: id(),
    personaId: uuid("persona_id").notNull().references(() => personas.id, { onDelete: "cascade" }),
    sourceId: uuid("source_id").notNull().references(() => sources.id, { onDelete: "cascade" }),
    subjectId: uuid("subject_id").notNull().references(() => subjects.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    situation: text("situation").notNull(),
    action: text("action").notNull(),
    outcome: text("outcome").notNull(),
    lesson: text("lesson"),
    quote: text("quote").notNull(),
    quoteOffset: integer("quote_offset").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("stories_persona").on(t.personaId)],
);

/** Audit log of everything the verifier threw away, and why. */
export const rejections = pgTable("rejections", {
  id: id(),
  personaId: uuid("persona_id").notNull().references(() => personas.id, { onDelete: "cascade" }),
  sourceId: uuid("source_id").references(() => sources.id, { onDelete: "cascade" }),
  stage: text("stage").notNull(), // extraction | synthesis
  item: jsonb("item").notNull(),
  reason: text("reason").notNull(),
  createdAt: createdAt(),
});

export const elementCategory = pgEnum("element_category", [
  "trait",
  "opinion",
  "budget",
  "responsibility",
  "belief",
  "goal",
  "pain_point",
  "decision_process",
  "objection",
  "language",
  "history",
]);

/** A synthesized persona element. Only exists if enough verified evidence supports it. */
export const personaElements = pgTable(
  "persona_elements",
  {
    id: id(),
    personaId: uuid("persona_id").notNull().references(() => personas.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    category: elementCategory("category").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    /** Where the real people disagree, described — never averaged away. */
    disagreement: text("disagreement"),
    /** anchor = rests on the person's own words; peers = only on similar people; both. */
    basis: text("basis").notNull().default("peers"),
    insightIds: jsonb("insight_ids").$type<string[]>().notNull().default([]),
    storyIds: jsonb("story_ids").$type<string[]>().notNull().default([]),
    subjectCount: integer("subject_count").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("elements_persona_version").on(t.personaId, t.version)],
);

/**
 * Coverage of each research question for a persona version. "unknown" is a first-class,
 * honest answer: the persona says so instead of guessing.
 */
export const researchAnswers = pgTable(
  "research_answers",
  {
    id: id(),
    personaId: uuid("persona_id").notNull().references(() => personas.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    question: text("question").notNull(),
    status: text("status").notNull(), // answered | partial | unknown
    answer: text("answer"),
    /** anchor | company | peers | mixed — whose evidence the answer rests on. */
    basis: text("basis"),
    insightIds: jsonb("insight_ids").$type<string[]>().notNull().default([]),
    storyIds: jsonb("story_ids").$type<string[]>().notNull().default([]),
    createdAt: createdAt(),
  },
  (t) => [index("answers_persona_version").on(t.personaId, t.version)],
);

/** Each conversation starts fresh: no memory carries across conversations. */
export const conversations = pgTable("conversations", {
  id: id(),
  personaId: uuid("persona_id").notNull().references(() => personas.id, { onDelete: "cascade" }),
  personaVersion: integer("persona_version").notNull(),
  title: text("title"),
  createdBy: text("created_by"),
  createdAt: createdAt(),
});

export const messages = pgTable(
  "messages",
  {
    id: id(),
    conversationId: uuid("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
    role: text("role").notNull(), // user | persona
    content: text("content").notNull(),
    innerThought: text("inner_thought"),
    insightIds: jsonb("insight_ids").$type<string[]>().notNull().default([]),
    storyIds: jsonb("story_ids").$type<string[]>().notNull().default([]),
    /** The reply split into blocks, each with its own evidence (for per-paragraph highlighting). */
    segments: jsonb("segments").$type<{ text: string; insightIds: string[]; storyIds: string[]; liveIds?: string[]; noEvidence: boolean }[]>(),
    /** Live-retrieved evidence this reply cites (see live_evidence). */
    liveIds: jsonb("live_ids").$type<string[]>().notNull().default([]),
    /** True when the reply cited no valid evidence. Shown as a warning, never as fact. */
    ungrounded: boolean("ungrounded").notNull().default(false),
    /** Exact assistant output, replayed so the model sees its own prior turns unchanged. */
    raw: text("raw"),
    createdAt: createdAt(),
  },
  (t) => [index("messages_conversation").on(t.conversationId)],
);

/**
 * A deep-research run by the Claude routine. The routine never writes to the database directly:
 * it submits its research here, and the app re-fetches and re-verifies everything before import.
 */
export const researchRuns = pgTable(
  "research_runs",
  {
    id: id(),
    personaId: uuid("persona_id").notNull().references(() => personas.id, { onDelete: "cascade" }),
    mode: text("mode").notNull(), // new | update
    status: text("status").notNull().default("requested"), // requested | researching | verifying | done | failed
    detail: text("detail"),
    sessionUrl: text("session_url"),
    /** The submitted research (seed format). */
    submission: jsonb("submission"),
    requestedBy: text("requested_by"),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("research_runs_persona").on(t.personaId)],
);

/** Server-side verification result for one submitted source (kept out of workflow payloads). */
export const researchChecks = pgTable(
  "research_checks",
  {
    id: id(),
    runId: uuid("run_id").notNull().references(() => researchRuns.id, { onDelete: "cascade" }),
    sourceIndex: integer("source_index").notNull(),
    result: jsonb("result").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("research_checks_run_source").on(t.runId, t.sourceIndex)],
);

export type SoulSection = { key: string; title: string; body: string; insightIds: string[]; storyIds: string[] };
export type SoulSheet = {
  phrases: { phrase: string; insightId: string }[];
  scales: { key: string; left: string; right: string; value: number | null; insightIds: string[] }[];
  lightsUpOn: { topic: string; insightIds: string[] }[];
  deflects: { topic: string; insightIds: string[] }[];
};

/**
 * The persona's SOUL.md: identity, beliefs, values, drives, frustrations, decisions, people,
 * voice and tensions, plus a character sheet. Built only from the anchor's own words and their
 * company's material, every section citing its evidence. One per persona version.
 */
export const personaSouls = pgTable(
  "persona_souls",
  {
    id: id(),
    personaId: uuid("persona_id").notNull().references(() => personas.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    sections: jsonb("sections").$type<SoulSection[]>().notNull(),
    sheet: jsonb("sheet").$type<SoulSheet>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("persona_souls_persona_version").on(t.personaId, t.version)],
);

/**
 * Evidence retrieved live during a conversation: fetched by our server, quotes verified verbatim
 * against the page. Attached to the conversation only; not part of the persona's researched evidence.
 */
export const liveEvidence = pgTable(
  "live_evidence",
  {
    id: id(),
    conversationId: uuid("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
    query: text("query").notNull(),
    url: text("url").notNull(),
    title: text("title"),
    quote: text("quote").notNull(),
    speaker: text("speaker").notNull(),
    /** True when the speaker is the person being simulated. */
    isAnchor: boolean("is_anchor").notNull(),
    summary: text("summary").notNull(),
    contentHash: text("content_hash"),
    retrievedAt: timestamp("retrieved_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("live_evidence_conversation").on(t.conversationId)],
);
