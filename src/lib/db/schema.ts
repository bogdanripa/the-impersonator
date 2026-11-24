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
  /** Transcript of the ICP builder chat (replayed to the model each turn). */
  builderMessages: jsonb("builder_messages").$type<unknown[]>().notNull().default([]),
  /** Incremented every time the persona is re-synthesized. */
  version: integer("version").notNull().default(0),
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
    /** True when the reply cited no valid evidence. Shown as a warning, never as fact. */
    ungrounded: boolean("ungrounded").notNull().default(false),
    /** Exact assistant output, replayed so the model sees its own prior turns unchanged. */
    raw: text("raw"),
    createdAt: createdAt(),
  },
  (t) => [index("messages_conversation").on(t.conversationId)],
);
