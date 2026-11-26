import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";

/**
 * LinkedIn shows profiles and posts only to signed-in members, so we read them through Apify
 * (HarvestAPI's actors, which need no LinkedIn account or cookies). The text is cached in the
 * database, so the research routine and the verifier see exactly the same text, and Apify is paid
 * once per page and month. The research routine has no Apify token: it reads through the app.
 *
 * Supported URLs:
 * - https://www.linkedin.com/in/<slug>/                     → profile (headline, about, experience)
 * - https://www.linkedin.com/in/<slug>/recent-activity/...  → their own recent posts
 * - https://www.linkedin.com/posts/<slug>_...-activity-<id>-... or /feed/update/urn:li:activity:<id>
 *                                                           → one post (found among their posts)
 */

const PROFILE_ACTOR = "harvestapi~linkedin-profile-scraper";
const POSTS_ACTOR = "harvestapi~linkedin-profile-posts";
const MAX_POSTS = 50;
const CACHE_DAYS = 30;
const APIFY_TIMEOUT_MS = 150_000;

export type LinkedInTarget =
  | { kind: "profile"; slug: string; url: string }
  | { kind: "posts"; slug: string; url: string }
  | { kind: "post"; slug: string | null; activityId: string; url: string };

export class LinkedInUnavailableError extends Error {}

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
    if (/^\/(recent-activity|detail\/recent-activity)/i.test(profile[2] ?? "")) {
      return { kind: "posts", slug, url: `https://www.linkedin.com/in/${slug}/recent-activity/all/` };
    }
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

/** The page's text, as the verifier will read it. */
export async function fetchLinkedIn(target: LinkedInTarget): Promise<{ title: string | null; text: string; hash: string }> {
  const page = process.env.DATABASE_URL ? await readThroughCache(target) : await readThroughApp(target);
  return { ...page, hash: createHash("sha256").update(page.text).digest("hex") };
}

async function readThroughCache(target: LinkedInTarget) {
  const cached = await db.query.linkedinPages.findFirst({ where: eq(schema.linkedinPages.url, target.url) });
  if (cached && Date.now() - cached.fetchedAt.getTime() < CACHE_DAYS * 86_400_000) return { title: cached.title, text: cached.text };
  const page = await scrape(target);
  await db
    .insert(schema.linkedinPages)
    .values({ url: target.url, title: page.title, text: page.text, fetchedAt: new Date() })
    .onConflictDoUpdate({ target: schema.linkedinPages.url, set: { title: page.title, text: page.text, fetchedAt: new Date() } });
  return page;
}

/** The research routine (no database, no Apify token) reads through the app's research API. */
async function readThroughApp(target: LinkedInTarget) {
  const base = process.env.RESEARCH_APP_URL?.replace(/\/$/, "");
  if (!base) throw new LinkedInUnavailableError("LinkedIn can only be read with DATABASE_URL or RESEARCH_APP_URL set");
  const headers: Record<string, string> = {};
  if (process.env.RESEARCH_API_TOKEN) headers.authorization = `Bearer ${process.env.RESEARCH_API_TOKEN}`;
  const res = await fetch(`${base}/api/research/linkedin?url=${encodeURIComponent(target.url)}`, {
    headers,
    signal: AbortSignal.timeout(APIFY_TIMEOUT_MS + 30_000),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `HTTP ${res.status} reading LinkedIn through the app`);
  }
  return { title: decodeURIComponent(res.headers.get("x-page-title") ?? "") || null, text: await res.text() };
}

async function runActor<T>(actor: string, input: unknown, maxItems: number): Promise<T[]> {
  const token = process.env.APIFY_TOKEN;
  if (!token) throw new LinkedInUnavailableError("LinkedIn reading isn't set up (APIFY_TOKEN is missing)");
  const params = new URLSearchParams({ maxItems: String(maxItems), maxTotalChargeUsd: "0.5", timeout: String(APIFY_TIMEOUT_MS / 1000) });
  const res = await fetch(`https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?${params}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(APIFY_TIMEOUT_MS + 15_000),
  });
  if (!res.ok) throw new Error(`LinkedIn reader (Apify) HTTP ${res.status}`);
  const items = (await res.json()) as T[];
  return Array.isArray(items) ? items : [];
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

async function scrape(target: LinkedInTarget): Promise<{ title: string | null; text: string }> {
  if (target.kind === "profile") return scrapeProfile(target.slug);
  if (target.kind === "posts") return scrapePosts(target.slug);
  return scrapePost(target);
}

async function scrapeProfile(slug: string) {
  const [p] = await runActor<Profile>(PROFILE_ACTOR, { urls: [`https://www.linkedin.com/in/${slug}/`] }, 1);
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
async function ownPosts(slug: string): Promise<Post[]> {
  const items = await runActor<Post>(
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

async function scrapePosts(slug: string) {
  const posts = await ownPosts(slug);
  if (!posts.length) throw new Error("No public LinkedIn posts written by this person were found");
  const { name, header } = postsHeader(posts, slug);
  return { title: `${name} | LinkedIn posts`, text: [header, ...posts.map(postBlock)].join("\n\n") };
}

async function scrapePost(target: Extract<LinkedInTarget, { kind: "post" }>) {
  if (!target.slug) {
    throw new Error("Use the person's posts page instead (linkedin.com/in/<name>/recent-activity/all/), or a post link that names its author");
  }
  const posts = await ownPosts(target.slug);
  const post = posts.find((p) => (p.linkedinUrl ?? "").includes(target.activityId) || p.id === target.activityId);
  if (!post) throw new Error("That post wasn't found among the author's recent public posts");
  const { name, header } = postsHeader([post], target.slug);
  return { title: `${name} | LinkedIn post`, text: [header, postBlock(post)].join("\n\n") };
}
