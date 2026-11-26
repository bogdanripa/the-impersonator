import { createHash } from "node:crypto";
import { eq, gte, isNull, lt, or, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { logEvent } from "@/lib/events";

/**
 * LinkedIn shows profiles and posts only to signed-in members, so we read them through Apify
 * (HarvestAPI's actors, which need no LinkedIn account or cookies).
 *
 * Apify charges per result, so every page goes through a shared cache in the database:
 * - each canonical URL is scraped at most once per TTL (profiles 90 days, posts 30), for everyone;
 * - while one request scrapes a page, the others wait for its result instead of paying again;
 * - a single post comes out of the cached posts page, never a scrape of its own;
 * - if a refresh fails, the previous copy is served;
 * - live lookups during chats read the cache only;
 * - every scrape is logged with its estimated cost, and new scrapes stop at APIFY_MONTHLY_BUDGET_USD.
 * The research routine and the verifier therefore read exactly the same text. The routine has no
 * Apify token: it reads through the app.
 *
 * Supported URLs:
 * - https://www.linkedin.com/in/<slug>/                     → profile (headline, about, experience)
 * - https://www.linkedin.com/in/<slug>/recent-activity/...  → their own recent posts
 * - https://www.linkedin.com/posts/<slug>_...-activity-<id>-... → one post (from their posts page)
 */

const PROFILE_ACTOR = "harvestapi~linkedin-profile-scraper";
const POSTS_ACTOR = "harvestapi~linkedin-profile-posts";
const MAX_POSTS = 50;
const DAY = 86_400_000;
const TTL = { profile: 90 * DAY, posts: 30 * DAY };
/** List prices (HarvestAPI, 2026): ~$4 per 1,000 profiles, ~$2 per 1,000 posts. */
const COST = { profile: 0.004, post: 0.002 };
const DEFAULT_MONTHLY_BUDGET_USD = 20;
const APIFY_TIMEOUT_MS = 150_000;
/** A scrape still marked as running after this long was abandoned. */
const CLAIM_STALE_MS = APIFY_TIMEOUT_MS + 60_000;
const WAIT_POLL_MS = 3_000;

export type LinkedInTarget =
  | { kind: "profile"; slug: string; url: string }
  | { kind: "posts"; slug: string; url: string }
  | { kind: "post"; slug: string | null; activityId: string; url: string };

type PageTarget = Exclude<LinkedInTarget, { kind: "post" }>;
type Page = { title: string | null; text: string };

/** LinkedIn can't be read right now (not set up, budget reached, or not cached for a cache-only read). */
export class LinkedInUnavailableError extends Error {}

const UPLOAD_HINT = "Save the profile as a PDF on LinkedIn (More → Save to PDF) and upload it instead.";

const postsUrl = (slug: string) => `https://www.linkedin.com/in/${slug}/recent-activity/all/`;

/** Recognises the LinkedIn pages we can read, with a canonical URL as the cache key. */
export function linkedinTarget(raw: string): LinkedInTarget | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (!/(^|\.)linkedin\.com$/i.test(u.hostname)) return null;
  const path = decodeURIComponent(u.pathname);
  const profile = /^\/in\/([^/]+)(\/.*)?$/i.exec(path);
  if (profile) {
    const slug = profile[1].toLowerCase();
    if (/^\/(recent-activity|detail\/recent-activity)/i.test(profile[2] ?? "")) return { kind: "posts", slug, url: postsUrl(slug) };
    return { kind: "profile", slug, url: `https://www.linkedin.com/in/${slug}/` };
  }
  const activity = /activity[-:](\d{10,})/i.exec(path) ?? /urn:li:(?:activity|share|ugcPost):(\d{10,})/i.exec(path);
  if (activity) {
    const slug = /^\/posts\/([^_/]+)_/i.exec(path)?.[1]?.toLowerCase() ?? null;
    const url = slug
      ? `https://www.linkedin.com/posts/${slug}_activity-${activity[1]}`
      : `https://www.linkedin.com/feed/update/urn:li:activity:${activity[1]}/`;
    return { kind: "post", slug, activityId: activity[1], url };
  }
  return null;
}

/** True when LinkedIn pages can be read here (directly with Apify, or through the app). */
export function linkedinReadable(): boolean {
  return !!process.env.APIFY_TOKEN || (!process.env.DATABASE_URL && !!process.env.RESEARCH_APP_URL);
}

/**
 * The page's text, as the verifier will read it. `cacheOnly` never pays for a scrape (live lookups
 * during chats): it serves what's cached, even if old, or throws LinkedInUnavailableError.
 */
export async function fetchLinkedIn(
  target: LinkedInTarget,
  { cacheOnly = false }: { cacheOnly?: boolean } = {},
): Promise<{ title: string | null; text: string; hash: string }> {
  let page: Page;
  if (!process.env.DATABASE_URL) page = await readThroughApp(target);
  else if (target.kind === "post") page = await readPost(target, cacheOnly);
  else page = await readPage(target, cacheOnly);
  return { ...page, hash: createHash("sha256").update(page.text).digest("hex") };
}

/** One post, cut out of the author's cached posts page (no scrape of its own). */
async function readPost(target: Extract<LinkedInTarget, { kind: "post" }>, cacheOnly: boolean): Promise<Page> {
  if (!target.slug) {
    throw new Error("Use the person's posts page instead (linkedin.com/in/<name>/recent-activity/all/), or a post link that names its author");
  }
  const posts = await readPage({ kind: "posts", slug: target.slug, url: postsUrl(target.slug) }, cacheOnly);
  const [header, ...blocks] = posts.text.split(/\n\n(?=Post(?: \(|:))/);
  const block = blocks.find((b) => b.split("\n")[0].includes(target.activityId));
  if (!block) throw new Error("That post isn't among the author's recent public posts; use their posts page instead");
  return { title: posts.title?.replace(/LinkedIn posts$/, "LinkedIn post") ?? null, text: `${header}\n\n${block}` };
}

/** Requests in this server instance that are already scraping a URL: share their result. */
const inFlight = new Map<string, Promise<Page>>();

async function readPage(target: PageTarget, cacheOnly: boolean): Promise<Page> {
  const row = await cachedRow(target.url);
  if (row && Date.now() - row.fetchedAt.getTime() < TTL[target.kind]) return row;
  if (cacheOnly) {
    if (row) return row; // old, but free
    throw new LinkedInUnavailableError("This LinkedIn page hasn't been read yet");
  }
  const running = inFlight.get(target.url);
  if (running) return running;
  const job = refresh(target, row).finally(() => inFlight.delete(target.url));
  inFlight.set(target.url, job);
  return job;
}

async function cachedRow(url: string) {
  const row = await db.query.linkedinPages.findFirst({ where: eq(schema.linkedinPages.url, url) });
  return row?.text ? { title: row.title, text: row.text, fetchedAt: row.fetchedAt, pendingSince: row.pendingSince } : null;
}

async function refresh(target: PageTarget, stale: Page | null): Promise<Page> {
  // Only one request (across all server instances) scrapes a URL at a time; the rest wait for it.
  if (!(await claim(target.url))) {
    const page = await waitForScrape(target);
    if (page) return page;
    if (!(await claim(target.url))) throw new Error("LinkedIn is still being read by another request; try again in a minute");
  }
  try {
    const page = await scrape(target);
    await db
      .update(schema.linkedinPages)
      .set({ title: page.title, text: page.text, fetchedAt: new Date(), pendingSince: null })
      .where(eq(schema.linkedinPages.url, target.url));
    return page;
  } catch (err) {
    await db.update(schema.linkedinPages).set({ pendingSince: null }).where(eq(schema.linkedinPages.url, target.url));
    if (stale) {
      console.warn(`LinkedIn refresh failed for ${target.url}; serving the cached copy`, err);
      return stale;
    }
    throw err;
  }
}

/** Marks the URL as being scraped. False if another request is already scraping it. */
async function claim(url: string): Promise<boolean> {
  const rows = await db
    .insert(schema.linkedinPages)
    .values({ url, text: "", fetchedAt: new Date(0), pendingSince: new Date() })
    .onConflictDoUpdate({
      target: schema.linkedinPages.url,
      set: { pendingSince: new Date() },
      setWhere: or(isNull(schema.linkedinPages.pendingSince), lt(schema.linkedinPages.pendingSince, new Date(Date.now() - CLAIM_STALE_MS))),
    })
    .returning({ url: schema.linkedinPages.url });
  return rows.length > 0;
}

/** Waits for another request's scrape of the same page. Null if it gave up without a result. */
async function waitForScrape(target: PageTarget): Promise<Page | null> {
  const deadline = Date.now() + CLAIM_STALE_MS;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, WAIT_POLL_MS));
    const row = await db.query.linkedinPages.findFirst({ where: eq(schema.linkedinPages.url, target.url) });
    if (row?.text && Date.now() - row.fetchedAt.getTime() < TTL[target.kind]) return { title: row.title, text: row.text };
    if (!row?.pendingSince) return row?.text ? { title: row.title, text: row.text } : null;
  }
  return null;
}

/** The research routine (no database, no Apify token) reads through the app's research API. */
async function readThroughApp(target: LinkedInTarget): Promise<Page> {
  const base = process.env.RESEARCH_APP_URL?.replace(/\/$/, "");
  if (!base) throw new LinkedInUnavailableError("LinkedIn can only be read with DATABASE_URL or RESEARCH_APP_URL set");
  const headers: Record<string, string> = {};
  if (process.env.RESEARCH_API_TOKEN) headers.authorization = `Bearer ${process.env.RESEARCH_API_TOKEN}`;
  const res = await fetch(`${base}/api/research/linkedin?url=${encodeURIComponent(target.url)}`, {
    headers,
    signal: AbortSignal.timeout(CLAIM_STALE_MS + 30_000),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `HTTP ${res.status} reading LinkedIn through the app`);
  }
  return { title: decodeURIComponent(res.headers.get("x-page-title") ?? "") || null, text: await res.text() };
}

export function monthlyBudgetUsd(): number {
  const v = Number(process.env.APIFY_MONTHLY_BUDGET_USD);
  return Number.isFinite(v) && v >= 0 && process.env.APIFY_MONTHLY_BUDGET_USD !== "" ? v : DEFAULT_MONTHLY_BUDGET_USD;
}

/** Estimated Apify spend since the start of this month (UTC). */
export async function spentThisMonthUsd(): Promise<number> {
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${schema.linkedinScrapes.costUsd}), 0)` })
    .from(schema.linkedinScrapes)
    .where(gte(schema.linkedinScrapes.createdAt, monthStart));
  return Number(row?.total ?? 0);
}

async function runActor<T>(target: PageTarget, actor: string, input: unknown, maxItems: number): Promise<T[]> {
  const token = process.env.APIFY_TOKEN;
  if (!token) throw new LinkedInUnavailableError(`Reading LinkedIn isn't set up. ${UPLOAD_HINT}`);
  const unit = target.kind === "profile" ? COST.profile : COST.post;
  const worstCase = unit * maxItems;
  const budget = monthlyBudgetUsd();
  const spent = await spentThisMonthUsd();
  if (spent + worstCase > budget) {
    await logEvent({ kind: "linkedin.budget_reached", level: "warn", message: `LinkedIn budget reached ($${spent.toFixed(2)} of $${budget.toFixed(2)}); not reading ${target.url}`, actor: "system", data: { url: target.url } });
    throw new LinkedInUnavailableError(
      `This month's LinkedIn budget ($${budget.toFixed(2)}) is used up; pages read before still work. ${UPLOAD_HINT}`,
    );
  }
  const params = new URLSearchParams({
    maxItems: String(maxItems),
    // Apify's own hard stop, a little above the expected price.
    maxTotalChargeUsd: (worstCase * 2 + 0.01).toFixed(2),
    timeout: String(APIFY_TIMEOUT_MS / 1000),
  });
  let items: T[] = [];
  let ok = false;
  try {
    const res = await fetch(`https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?${params}`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(APIFY_TIMEOUT_MS + 15_000),
    });
    if (!res.ok) throw new Error(`LinkedIn reader (Apify) HTTP ${res.status}`);
    const body = (await res.json()) as T[];
    items = Array.isArray(body) ? body : [];
    ok = true;
    return items;
  } finally {
    // Charged per result returned; a failed run returns none.
    await db
      .insert(schema.linkedinScrapes)
      .values({ url: target.url, actor, items: items.length, costUsd: unit * items.length, ok })
      .catch((err) => console.error("Couldn't log LinkedIn scrape", err));
    await logEvent({
      kind: "linkedin.read",
      level: ok ? "info" : "warn",
      message: `${ok ? "Read" : "Couldn't read"} LinkedIn ${target.kind}: ${target.url} (${items.length} items, ~$${(unit * items.length).toFixed(3)})`,
      actor: "system",
      data: { url: target.url, actor, items: items.length, costUsd: unit * items.length, ok },
    });
  }
}

type DateParts = { month?: string | number | null; year?: number | null; text?: string | null } | null | undefined;
type Profile = {
  publicIdentifier?: string; firstName?: string; lastName?: string; headline?: string | null; about?: string | null;
  location?: { linkedinText?: string | null } | null;
  currentPosition?: { companyName?: string | null; position?: string | null }[] | null;
  experience?: {
    position?: string | null; companyName?: string | null; location?: string | null; description?: string | null;
    startDate?: DateParts; endDate?: DateParts;
  }[] | null;
  education?: { schoolName?: string | null; degree?: string | null; fieldOfStudy?: string | null }[] | null;
  error?: string;
};
type Post = {
  id?: string; linkedinUrl?: string; content?: string | null; type?: string;
  author?: { publicIdentifier?: string | null; name?: string | null; info?: string | null; linkedinUrl?: string | null } | null;
  postedAt?: { date?: string | null } | null;
  /** On a quote post: the post being shared (someone else's). `content` holds only their own comment. */
  repost?: { author?: { name?: string | null } | null } | null;
};

const when = (d: DateParts) => d?.text || [d?.month, d?.year].filter(Boolean).join(" ") || "";
const clean = (s: string | null | undefined) => (s ?? "").replace(/\r\n/g, "\n").replace(/[ \t ]+/g, " ").trim();

async function scrape(target: PageTarget): Promise<Page> {
  return target.kind === "profile" ? scrapeProfile(target) : scrapePosts(target);
}

async function scrapeProfile(target: Extract<PageTarget, { kind: "profile" }>) {
  const [p] = await runActor<Profile>(target, PROFILE_ACTOR, { urls: [target.url] }, 1);
  if (!p || p.error || !(p.firstName || p.lastName)) throw new Error("LinkedIn profile not found or not public");
  const name = clean(`${p.firstName ?? ""} ${p.lastName ?? ""}`);
  // The first line names them with their headline: a sentence the verifier can use as identity quote.
  const lines = [`LinkedIn profile of ${name}${p.headline ? `, ${clean(p.headline)}` : ""}`];
  if (p.headline) lines.push(`Headline: ${clean(p.headline)}`);
  const current = (p.currentPosition ?? []).map((c) => clean([c.position, c.companyName].filter(Boolean).join(" at "))).filter(Boolean);
  if (current.length) lines.push(`Current position: ${current.join("; ")}`);
  if (p.location?.linkedinText) lines.push(`Location: ${clean(p.location.linkedinText)}`);
  if (p.about) lines.push("", "About", clean(p.about));
  const exp = p.experience ?? [];
  if (exp.length) {
    lines.push("", "Experience");
    for (const e of exp) {
      const dates = [when(e.startDate), when(e.endDate) || "Present"].filter(Boolean).join(" – ");
      lines.push("", clean(`${e.position ?? ""}${e.companyName ? ` at ${e.companyName}` : ""}${dates ? ` (${dates})` : ""}`));
      if (e.description) lines.push(clean(e.description));
    }
  }
  const edu = (p.education ?? []).map((e) => clean([e.schoolName, e.degree, e.fieldOfStudy].filter(Boolean).join(", "))).filter(Boolean);
  if (edu.length) lines.push("", "Education", ...edu);
  return { title: `${name} | LinkedIn`, text: lines.join("\n").replace(/\n{3,}/g, "\n\n") };
}

/** Only posts the person wrote: reposts and other people's posts are left out. */
async function ownPosts(target: Extract<PageTarget, { kind: "posts" }>): Promise<Post[]> {
  const slug = target.slug;
  const items = await runActor<Post>(
    target,
    POSTS_ACTOR,
    { targetUrls: [`https://www.linkedin.com/in/${slug}/`], maxPosts: MAX_POSTS, includeReposts: false, includeQuotePosts: true, scrapeReactions: false, scrapeComments: false },
    MAX_POSTS,
  );
  return items
    .filter((p) => {
      const author = (p.author?.publicIdentifier ?? p.author?.linkedinUrl ?? "").toLowerCase();
      return clean(p.content) && (!p.type || p.type === "post") && author.includes(slug);
    })
    .sort((a, b) => (b.postedAt?.date ?? "").localeCompare(a.postedAt?.date ?? ""));
}

function postBlock(p: Post) {
  const date = p.postedAt?.date ? p.postedAt.date.slice(0, 10) : "";
  const shared = clean(p.repost?.author?.name);
  return [
    `Post${date ? ` (${date})` : ""}${p.linkedinUrl ? `: ${p.linkedinUrl}` : ""}`,
    ...(shared ? [`(Their comment when sharing a post by ${shared}; the shared post isn't included.)`] : []),
    clean(p.content),
  ].join("\n");
}

function postsHeader(posts: Post[], slug: string) {
  const a = posts[0]?.author;
  const name = clean(a?.name) || slug;
  return { name, header: `LinkedIn posts by ${name}${a?.info ? `, ${clean(a.info)}` : ""}` };
}

async function scrapePosts(target: Extract<PageTarget, { kind: "posts" }>) {
  const slug = target.slug;
  const posts = await ownPosts(target);
  if (!posts.length) throw new Error("No public LinkedIn posts written by this person were found");
  const { name, header } = postsHeader(posts, slug);
  return { title: `${name} | LinkedIn posts`, text: [header, ...posts.map(postBlock)].join("\n\n") };
}
