import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { createHash } from "node:crypto";
import { extractText, getDocumentProxy } from "unpdf";
import { attachmentId, getAttachmentText } from "@/lib/attachments";

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_PDF_BYTES = 40 * 1024 * 1024; // annual reports are large
const MAX_CHARS = 400_000;
const MAX_PDF_CHARS = 2_000_000;
const MIN_CHARS = 1_500;
const TIMEOUT_MS = 20_000;

export type FetchedSource = { title: string | null; text: string; hash: string; via?: "direct" | "renderer" };

function isPrivateAddress(ip: string): boolean {
  if (ip.includes(":")) {
    const v = ip.toLowerCase();
    if (v.startsWith("::ffff:")) return isPrivateAddress(v.slice(7));
    return v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80");
  }
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  );
}

/** Blocks requests to internal networks (users can paste URLs, so this is an SSRF guard). */
export async function assertPublicUrl(raw: string): Promise<URL> {
  const url = new URL(raw);
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Only http(s) URLs are allowed");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new Error("Internal hosts are not allowed");
  }
  const addresses = isIP(host) ? [host] : (await lookup(host, { all: true })).map((r) => r.address);
  if (addresses.length === 0 || addresses.some(isPrivateAddress)) throw new Error("Private addresses are not allowed");
  return url;
}

async function readCapped(res: Response, maxBytes: number): Promise<Uint8Array> {
  const reader = res.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error(`File is larger than ${Math.round(maxBytes / 1024 / 1024)} MB`);
    }
    chunks.push(value);
  }
  return new Uint8Array(Buffer.concat(chunks));
}

/**
 * Extracts a PDF's text page by page. Words split across lines with a hyphen ("mar-\nketing")
 * are rejoined so quotes from reports can be verified verbatim.
 */
export async function pdfToText(bytes: Uint8Array): Promise<{ title: string | null; text: string }> {
  const pdf = await getDocumentProxy(bytes, { verbosity: 0 });
  const { text: pages } = await extractText(pdf, { mergePages: false });
  let title: string | null = null;
  try {
    const meta = await pdf.getMetadata();
    const t = (meta.info as { Title?: unknown } | undefined)?.Title;
    title = typeof t === "string" && t.trim() ? t.trim() : null;
  } catch {
    // no metadata
  }
  const text = pages
    .map((p) => p.replace(/([a-z])-\s*\n\s*([a-z])/g, "$1$2").replace(/[ \t\u00a0]+/g, " ").trim())
    .filter(Boolean)
    .join("\n\n");
  return { title, text };
}

function htmlToText(html: string, url: string): { title: string | null; text: string } {
  const { document } = parseHTML(html);
  let title: string | null = document.querySelector("title")?.textContent?.trim() || null;
  let contentHtml: string | null = null;
  try {
    // linkedom's document is close enough to the DOM for Readability.
    const article = new Readability(document as unknown as Document, { charThreshold: 500 }).parse();
    if (article?.content) {
      contentHtml = article.content;
      title = article.title?.trim() || title;
    }
  } catch {
    // fall through to body text
  }
  if (!contentHtml) contentHtml = document.querySelector("body")?.innerHTML ?? html;
  // Keep block boundaries as newlines so transcripts keep their speaker turns.
  const marked = contentHtml.replace(/<\/(p|h[1-6]|li|div|blockquote|tr|section|article)>|<br\s*\/?>/gi, (m) => `${m}\n`);
  const { document: doc } = parseHTML(`<html><body>${marked}</body></html>`);
  doc.querySelectorAll("script,style,noscript").forEach((el) => el.remove());
  const text = (doc.querySelector("body")?.textContent ?? "")
    .replace(/[ \t ]+/g, " ")
    .replace(/\n\s*\n+/g, "\n\n")
    .trim();
  void url;
  return { title, text };
}

const USER_AGENT = "Mozilla/5.0 (compatible; TheImpersonator/1.0; +https://the-impersonator.vercel.app; fetching a page on a user's request)";
const RENDERER = "https://r.jina.ai/";

/** The site asked for a login: we never get past one. Upload a PDF of the page instead. */
export class LoginWallError extends Error {
  constructor(url: URL) {
    super(
      `${url.hostname} shows this page only after signing in, so it can't be read automatically. ` +
        `Save it as a PDF (on LinkedIn: More → Save to PDF) and upload it instead.`,
    );
  }
}

const LOGIN_PATH = /\/(authwall|login|log-in|signin|sign-in|signup|sign-up|checkpoint|uas\/login|accounts\/login)\b/i;
/** Sites that show profiles and posts only to signed-in members. */
const MEMBERS_ONLY = /(^|\.)(linkedin\.com|facebook\.com|instagram\.com)$/i;

function looksLikeLoginWall(text: string) {
  const t = text.slice(0, 4000).toLowerCase();
  return (
    text.length < 3000 &&
    /((sign|log) in|join) to (see|view|continue|read)|agree & join|join now to see/.test(t)
  );
}

/** Statuses that usually mean "bot protection", not "this page is private". */
const RETRY_VIA_RENDERER = new Set([403, 429, 503, 520, 521, 522, 523, 524, 999]);

/**
 * Reads a public page through a headless-browser reader service (Jina Reader). Used when the
 * page needs JavaScript or the site's bot protection turned away our plain request. Never for
 * pages behind a login or paywall.
 */
async function renderPage(url: URL): Promise<{ title: string | null; text: string }> {
  const headers: Record<string, string> = { accept: "application/json", "x-return-format": "text", "x-timeout": "25" };
  if (process.env.JINA_API_KEY) headers.authorization = `Bearer ${process.env.JINA_API_KEY}`;
  const res = await fetch(`${RENDERER}${url.toString()}`, { headers, signal: AbortSignal.timeout(40_000) });
  if (!res.ok) throw new Error(`reader service HTTP ${res.status}`);
  const body = (await res.json().catch(() => null)) as { data?: { title?: string; text?: string; content?: string; url?: string; finalUrl?: string } } | null;
  const text = (body?.data?.text ?? body?.data?.content ?? "")
    .replace(/[ \t\u00a0]+/g, " ")
    .replace(/\n\s*\n+/g, "\n\n")
    .trim();
  const finalUrl = new URL(body?.data?.finalUrl || body?.data?.url || url.toString());
  if (LOGIN_PATH.test(finalUrl.pathname) || looksLikeLoginWall(text)) throw new LoginWallError(url);
  return { title: body?.data?.title?.trim() || null, text };
}

/**
 * Fetches a page ourselves (never from model memory) and returns its readable text.
 * Every fetch is for a page a user or a research run asked for (like ChatGPT-User), so robots.txt
 * doesn't apply; we identify ourselves honestly instead. Pages that need JavaScript or that bot
 * protection turned away are read through a headless-browser reader. Login walls are respected.
 * Throws on anything we can't read in full, so no source is ever summarized from nothing.
 * `attachment:<id>` reads a file the team uploaded.
 */
export async function fetchSource(rawUrl: string): Promise<FetchedSource> {
  const uploaded = attachmentId(rawUrl);
  if (uploaded) return getAttachmentText(uploaded);

  let url = await assertPublicUrl(rawUrl);
  if (MEMBERS_ONLY.test(url.hostname) && LOGIN_PATH.test(url.pathname)) throw new LoginWallError(url);
  let res: Response | null = null;
  let networkError: Error | null = null;
  try {
    for (let hop = 0; hop < 5; hop++) {
      res = await fetch(url, {
        redirect: "manual",
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: {
          "user-agent": USER_AGENT,
          accept: "text/html,application/xhtml+xml,application/pdf;q=0.9,text/plain;q=0.8",
          "accept-language": "en",
        },
      });
      const location = res.headers.get("location");
      if (res.status >= 300 && res.status < 400 && location) {
        const next = new URL(location, url);
        if (LOGIN_PATH.test(next.pathname)) throw new LoginWallError(url);
        url = await assertPublicUrl(next.toString());
        continue;
      }
      break;
    }
  } catch (err) {
    if (err instanceof LoginWallError) throw err;
    networkError = err as Error;
  }

  const viaRenderer = async (why: string): Promise<FetchedSource> => {
    if (MEMBERS_ONLY.test(url.hostname)) throw new LoginWallError(url);
    let rendered: { title: string | null; text: string };
    try {
      rendered = await renderPage(url);
    } catch (err) {
      if (err instanceof LoginWallError) throw err;
      throw new Error(`${why}; the reader service couldn't read it either (${(err as Error).message})`);
    }
    if (rendered.text.length < MIN_CHARS) {
      throw new Error(`${why}; the reader service found only ${rendered.text.length} characters of text (likely paywalled or video-only)`);
    }
    const clipped = rendered.text.slice(0, MAX_CHARS);
    return { title: rendered.title, text: clipped, hash: createHash("sha256").update(clipped).digest("hex"), via: "renderer" };
  };

  if (networkError || !res) return viaRenderer(`Couldn't connect (${networkError?.message ?? "error"})`);
  if (res.status === 401 || res.status === 407) throw new LoginWallError(url);
  if (!res.ok) {
    if (RETRY_VIA_RENDERER.has(res.status)) return viaRenderer(`HTTP ${res.status} fetching page`);
    throw new Error(`HTTP ${res.status} fetching page`);
  }
  const type = res.headers.get("content-type") ?? "";
  const isPdf = /application\/pdf/.test(type) || (/application\/octet-stream/.test(type) && /\.pdf$/i.test(url.pathname));
  if (!isPdf && !/text\/html|application\/xhtml|text\/plain/.test(type)) throw new Error(`Unsupported content type: ${type || "unknown"}`);
  const bytes = await readCapped(res, isPdf ? MAX_PDF_BYTES : MAX_BYTES);
  let title: string | null;
  let text: string;
  if (isPdf) {
    ({ title, text } = await pdfToText(bytes).catch((err: Error) => {
      throw new Error(`Couldn't read PDF: ${err.message}`);
    }));
  } else {
    const body = new TextDecoder().decode(bytes);
    ({ title, text } = type.includes("text/plain") ? { title: null, text: body.trim() } : htmlToText(body, url.toString()));
    if (looksLikeLoginWall(text)) throw new LoginWallError(url);
  }
  if (text.length < MIN_CHARS) {
    if (isPdf) throw new Error(`Only ${text.length} characters of text in the PDF (likely a scanned image)`);
    // Little text in a page that loaded fine: usually a JavaScript app. Render it.
    return viaRenderer(`Only ${text.length} characters of readable text without JavaScript`);
  }
  const clipped = text.slice(0, isPdf ? MAX_PDF_CHARS : MAX_CHARS);
  return { title, text: clipped, hash: createHash("sha256").update(clipped).digest("hex"), via: "direct" };
}
