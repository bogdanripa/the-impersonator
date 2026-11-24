import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { assertPublicUrl } from "@/lib/fetch-source";
import { nameKey, normalize } from "@/lib/verify";

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

function registrableDomain(host: string) {
  return host.toLowerCase().replace(/^www\./, "").split(".").slice(-2).join(".");
}

/**
 * Stores the persona's official photo and company logo.
 * The photo is accepted only if its page names the person and the image is hosted on that
 * page's own site; otherwise the card falls back to initials.
 */
export async function refreshPersonaMedia(personaId: string) {
  const persona = await db.query.personas.findFirst({ where: eq(schema.personas.id, personaId) });
  const icp = persona?.icp;
  if (!persona || !icp) return { photo: "no persona", logo: "no persona" };
  const result = { photo: "none", logo: "none" };
  const set: Partial<typeof schema.personas.$inferInsert> = {};

  if (icp.anchor_photo_url && icp.anchor_photo_page) {
    try {
      const page = new URL(icp.anchor_photo_page);
      const img = new URL(icp.anchor_photo_url, page);
      if (registrableDomain(page.hostname) !== registrableDomain(img.hostname)) throw new Error("Photo isn't hosted on the page's own site");
      // The page must name the person and reference this exact image.
      const html = await fetchHtml(page.toString());
      if (!normalize(html).includes(nameKey(icp.anchor_name))) throw new Error("Photo page doesn't name the person");
      const safeDecode = (v: string) => {
        try {
          return decodeURIComponent(v);
        } catch {
          return v;
        }
      };
      const paths = [img.pathname, safeDecode(img.pathname)];
      const pageHtml = [html, safeDecode(html.replace(/%(?![0-9a-f]{2})/gi, "%25"))];
      if (!paths.some((p) => pageHtml.some((h) => h.includes(p)))) throw new Error("Photo isn't on that page");
      const photo = await fetchImage(img.toString());
      Object.assign(set, { photoData: photo.data, photoType: photo.type, photoSourceUrl: page.toString() });
      result.photo = "ok";
    } catch (err) {
      result.photo = (err as Error).message;
    }
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
