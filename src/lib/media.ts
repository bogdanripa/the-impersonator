import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { assertPublicUrl } from "@/lib/fetch-source";
import { parseHTML } from "linkedom";
import { z } from "zod";
import { zodTextFormat } from "openai/helpers/zod";
import { checkResponse, llm, MODEL } from "@/lib/llm";
import type { Icp } from "@/lib/types";
import { nameKey, normalize } from "@/lib/verify";

/** Web search for official pages that show the person's headshot (verified separately). */
async function searchPhotoPages(icp: Icp): Promise<string[]> {
  const response = await llm().responses.parse({
    model: MODEL,
    reasoning: { effort: "low" },
    tools: [{ type: "web_search" }],
    instructions:
      "Find public web pages that show a headshot photo of this specific person and name them on the page: their company's leadership/team/newsroom pages, press releases with their photo, conference or event speaker pages, award pages, podcast guest pages. Not LinkedIn, not social media, not image search results. Only return URLs you actually saw in search results.",
    input: `${icp.anchor_name}, ${icp.anchor_role} at ${icp.anchor_company}`,
    text: { format: zodTextFormat(z.object({ pages: z.array(z.string()).describe("Up to 6 page URLs, best first") }), "photo_pages") },
  });
  checkResponse(response);
  return (response.output_parsed?.pages ?? []).filter((u) => /^https?:\/\//.test(u) && !/linkedin\.com|facebook\.com|instagram\.com|x\.com|twitter\.com/i.test(u)).slice(0, 6);
}

/** Lowercase, accents removed, non-alphanumerics to spaces: "Pitiș" and "Pitis" compare equal. */
function fold(v: string) {
  return v.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * Picks the person's photo from a page that's about them: an image whose alt text names them, or
 * whose file name contains their name; otherwise the page's preview image (og:image) when the
 * page itself is about them (their name is in its URL or title).
 */
function findPhotoOnPage(html: string, pageUrl: URL, name: string): string | null {
  const { document } = parseHTML(html);
  const words = fold(name).split(" ").filter((w) => w.length > 1);
  const surname = words.at(-1) ?? "";
  const nameIn = (v: string | null | undefined) => {
    const f = fold(v ?? "");
    return !!surname && f.includes(surname) && words.filter((w) => f.includes(w)).length >= Math.min(2, words.length);
  };
  let best: { url: string; score: number } | null = null;
  for (const img of document.querySelectorAll("img")) {
    const srcset = img.getAttribute("srcset") ?? img.getAttribute("data-srcset") ?? "";
    const src = img.getAttribute("data-src") || img.getAttribute("src") || srcset.split(",")[0]?.trim().split(" ")[0] || "";
    if (!src || src.startsWith("data:") || src === "#") continue;
    let score = 0;
    if (nameIn(img.getAttribute("alt"))) score += 3;
    if (nameIn(decodeURIComponentSafe(src.split("/").pop() ?? ""))) score += 2;
    if (/speaker|profile|avatar|portrait|headshot|team|bio/i.test(img.getAttribute("class") ?? "")) score += 1;
    if (score >= 2 && (!best || score > best.score)) best = { url: new URL(src, pageUrl).toString(), score };
  }
  if (best) return best.url;
  const og = document.querySelector('meta[property="og:image"]')?.getAttribute("content");
  const title = document.querySelector("title")?.textContent ?? "";
  if (og && (nameIn(decodeURIComponentSafe(pageUrl.pathname)) || nameIn(title))) return new URL(og, pageUrl).toString();
  return null;
}

function decodeURIComponentSafe(v: string) {
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}

const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

async function fetchImage(rawUrl: string): Promise<{ data: string; type: string }> {
  let url = await assertPublicUrl(rawUrl);
  let res: Response | null = null;
  for (let hop = 0; hop < 5; hop++) {
    res = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
      headers: { "user-agent": "Mozilla/5.0 (compatible; TheImpersonatorResearch/0.1)", accept: "image/*" },
    });
    const location = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && location) {
      url = await assertPublicUrl(new URL(location, url).toString());
      continue;
    }
    break;
  }
  if (!res?.ok) throw new Error(`HTTP ${res?.status ?? "error"} fetching image`);
  const type = (res.headers.get("content-type") ?? "").split(";")[0].trim();
  if (!/^image\/(png|jpe?g|webp|gif|svg\+xml|x-icon|vnd\.microsoft\.icon)$/.test(type)) throw new Error(`Not an image (${type || "unknown"})`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.byteLength > MAX_IMAGE_BYTES) throw new Error("Image larger than 3 MB");
  if (buf.byteLength < 200) throw new Error("Image is empty");
  return { data: buf.toString("base64"), type };
}

async function fetchHtml(rawUrl: string): Promise<string> {
  const url = await assertPublicUrl(rawUrl);
  const res = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(15_000),
    headers: { "user-agent": "Mozilla/5.0 (compatible; TheImpersonatorResearch/0.1)", accept: "text/html" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching photo page`);
  return (await res.text()).slice(0, 3_000_000);
}

/**
 * Stores the persona's official photo and company logo.
 * The photo is accepted only if it comes from a page that names the person and shows that image
 * (official leadership, newsroom or event-speaker pages); otherwise the card shows initials.
 */
export async function refreshPersonaMedia(personaId: string, opts: { forceSearch?: boolean } = {}) {
  const persona = await db.query.personas.findFirst({ where: eq(schema.personas.id, personaId) });
  const icp = persona?.icp;
  if (!persona || !icp) return { photo: "no persona", logo: "no persona" };
  const result = { photo: "none", logo: "none" };
  const set: Partial<typeof schema.personas.$inferInsert> = {};

  const tryPage = async (pageUrl: string, photoUrl: string) => {
    const page = new URL(pageUrl);
    // The page must name the person; the image must be one that this page shows.
    const html = await fetchHtml(page.toString());
    const pageText = fold(html);
    if (!fold(icp.anchor_name).split(" ").every((w) => pageText.includes(w))) throw new Error("Photo page doesn't name the person");
    let imgUrl: string | null = null;
    if (photoUrl) {
      const img = new URL(photoUrl, page);
      const paths = [img.pathname, decodeURIComponentSafe(img.pathname)];
      if (paths.some((p) => html.includes(p) || decodeURIComponentSafe(html.replace(/%(?![0-9a-f]{2})/gi, "%25")).includes(p))) {
        imgUrl = img.toString();
      }
    }
    imgUrl ??= findPhotoOnPage(html, page, icp.anchor_name);
    if (!imgUrl) throw new Error("No photo of the person found on that page");
    return { ...(await fetchImage(imgUrl)), page: page.toString() };
  };

  const candidates: { page: string; img: string }[] = [];
  if (icp.anchor_photo_page) candidates.push({ page: icp.anchor_photo_page, img: icp.anchor_photo_url ?? "" });
  // No usable page yet (and no stored photo): look for one on the web.
  const searched = !persona.photoData || !!opts.forceSearch;
  let tried = 0;
  for (let round = 0; round < 2; round++) {
    for (const c of candidates.slice(tried)) {
      tried++;
      try {
        const photo = await tryPage(c.page, c.img);
        Object.assign(set, { photoData: photo.data, photoType: photo.type, photoSourceUrl: photo.page });
        if (photo.page !== icp.anchor_photo_page) set.icp = { ...icp, anchor_photo_page: photo.page, anchor_photo_url: "" };
        result.photo = "ok";
        break;
      } catch (err) {
        result.photo = (err as Error).message;
      }
    }
    if (result.photo === "ok" || round > 0 || !searched) break;
    const found = await searchPhotoPages(icp).catch(() => []);
    candidates.push(...found.filter((u) => !candidates.some((c) => c.page === u)).map((page) => ({ page, img: "" })));
    if (tried === candidates.length) break;
  }

  const domain = icp.company_domain?.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (domain && /^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) {
    try {
      const logo = await fetchImage(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`);
      Object.assign(set, { logoData: logo.data, logoType: logo.type });
      result.logo = "ok";
    } catch (err) {
      result.logo = (err as Error).message;
    }
  }

  if (Object.keys(set).length) await db.update(schema.personas).set(set).where(eq(schema.personas.id, personaId));
  return result;
}
