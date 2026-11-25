import { eq } from "drizzle-orm";
import { createHash } from "node:crypto";
import { db, schema } from "@/lib/db";

export { ATTACHMENT_PREFIX, attachmentUrl, attachmentId, attachmentHref } from "@/lib/attachment-url";

export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024; // Vercel caps request bodies at 4.5 MB
export const MIN_UPLOAD_CHARS = 200;

/**
 * The stored text of an upload. In the app it comes from the database; in the research routine
 * (no database) it comes from the app's research API, so the routine and the verifier read the
 * exact same text.
 */
export async function getAttachmentText(id: string): Promise<{ title: string | null; text: string; hash: string }> {
  let title: string | null = null;
  let text: string;
  if (process.env.DATABASE_URL) {
    const row = await db.query.attachments.findFirst({ where: eq(schema.attachments.id, id) });
    if (!row) throw new Error("Uploaded file not found");
    title = row.title ?? row.filename;
    text = row.text;
  } else {
    const base = process.env.RESEARCH_APP_URL?.replace(/\/$/, "");
    if (!base) throw new Error("Uploaded files can only be read with DATABASE_URL or RESEARCH_APP_URL set");
    const headers: Record<string, string> = {};
    if (process.env.RESEARCH_API_TOKEN) headers.authorization = `Bearer ${process.env.RESEARCH_API_TOKEN}`;
    const res = await fetch(`${base}/api/research/attachments/${id}`, { headers, signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status} reading the uploaded file`);
    title = decodeURIComponent(res.headers.get("x-attachment-title") ?? "") || null;
    text = await res.text();
  }
  return { title, text, hash: createHash("sha256").update(text).digest("hex") };
}
