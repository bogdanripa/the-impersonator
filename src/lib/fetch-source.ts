import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { createHash } from "node:crypto";

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_CHARS = 400_000;
const MIN_CHARS = 1_500;
const TIMEOUT_MS = 20_000;

export type FetchedSource = { title: string | null; text: string; hash: string };

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
async function assertPublicUrl(raw: string): Promise<URL> {
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

async function readCapped(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) {
      await reader.cancel();
      throw new Error("Page is larger than 5 MB");
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
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

/**
 * Fetches a page ourselves (never from model memory) and returns its readable text.
 * Throws on anything we can't read in full, so no source is ever summarized from nothing.
 */
export async function fetchSource(rawUrl: string): Promise<FetchedSource> {
  let url = await assertPublicUrl(rawUrl);
  let res: Response | null = null;
  for (let hop = 0; hop < 5; hop++) {
    res = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; TheImpersonatorResearch/0.1)",
        accept: "text/html,application/xhtml+xml,text/plain;q=0.9",
      },
    });
    const location = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && location) {
      url = await assertPublicUrl(new URL(location, url).toString());
      continue;
    }
    break;
  }
  if (!res || !res.ok) throw new Error(`HTTP ${res?.status ?? "error"} fetching page`);
  const type = res.headers.get("content-type") ?? "";
  if (!/text\/html|application\/xhtml|text\/plain/.test(type)) throw new Error(`Unsupported content type: ${type || "unknown"}`);
  const body = await readCapped(res);
  const { title, text } = type.includes("text/plain") ? { title: null, text: body.trim() } : htmlToText(body, url.toString());
  if (text.length < MIN_CHARS) {
    throw new Error(`Only ${text.length} characters of readable text (likely paywalled, video-only or blocked)`);
  }
  const clipped = text.slice(0, MAX_CHARS);
  return { title, text: clipped, hash: createHash("sha256").update(clipped).digest("hex") };
}
