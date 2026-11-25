import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { handleError, jsonError } from "@/lib/http";
import { pdfToText } from "@/lib/fetch-source";
import { attachmentUrl, MAX_UPLOAD_BYTES, MIN_UPLOAD_CHARS } from "@/lib/attachments";

export const maxDuration = 60;

const TEXT_TYPES = /^text\/(plain|markdown)$/;

/** Files uploaded for this persona (text not included). */
export async function GET(_request: Request, ctx: RouteContext<"/api/personas/[id]/attachments">) {
  try {
    const { id } = await ctx.params;
    const files = await db
      .select({
        id: schema.attachments.id, filename: schema.attachments.filename, sizeBytes: schema.attachments.sizeBytes,
        uploadedBy: schema.attachments.uploadedBy, createdAt: schema.attachments.createdAt,
      })
      .from(schema.attachments)
      .where(eq(schema.attachments.personaId, id))
      .orderBy(asc(schema.attachments.createdAt));
    return NextResponse.json({ files: files.map((f) => ({ ...f, url: attachmentUrl(f.id) })) });
  } catch (err) {
    return handleError(err);
  }
}

/**
 * Uploads a PDF or text file for the persona, e.g. LinkedIn's "Save to PDF" export of the
 * person's profile. Only its text is kept; research can use it as a source.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/personas/[id]/attachments">) {
  try {
    const { id } = await ctx.params;
    const persona = await db.query.personas.findFirst({ where: eq(schema.personas.id, id) });
    if (!persona) return jsonError("Persona not found", 404);
    if (!["draft", "ready", "failed"].includes(persona.status)) return jsonError("Wait for the current research to finish.", 409);

    const form = await request.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) return jsonError("Attach a file");
    if (file.size > MAX_UPLOAD_BYTES) return jsonError("Files can be up to 4 MB");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
    const isText = TEXT_TYPES.test(file.type) || /\.(txt|md)$/i.test(file.name);
    if (!isPdf && !isText) return jsonError("Upload a PDF or a text file");

    let title: string | null = null;
    let text: string;
    if (isPdf) {
      if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") return jsonError("That file isn't a valid PDF");
      try {
        ({ title, text } = await pdfToText(bytes));
      } catch (err) {
        return jsonError(`Couldn't read the PDF: ${(err as Error).message}`);
      }
    } else {
      text = new TextDecoder().decode(bytes).replace(/\r\n/g, "\n").trim();
    }
    if (text.length < MIN_UPLOAD_CHARS) {
      return jsonError(isPdf ? "No text found in the PDF (it may be a scanned image)." : "The file is almost empty.");
    }
    // LinkedIn's export is titled "Resume"; name it for what it is.
    if (/linkedin\.com\/in\//i.test(text)) title = "LinkedIn profile";
    else if (!title || /^(resume|untitled|document)$/i.test(title)) title = file.name.replace(/\.[a-z0-9]+$/i, "");
    const [row] = await db
      .insert(schema.attachments)
      .values({
        personaId: id,
        filename: file.name.slice(0, 200),
        contentType: isPdf ? "application/pdf" : "text/plain",
        sizeBytes: file.size,
        title,
        text: text.slice(0, 1_000_000),
        uploadedBy: request.headers.get("x-user-email"),
      })
      .returning({ id: schema.attachments.id, filename: schema.attachments.filename });
    return NextResponse.json({ file: { ...row, url: attachmentUrl(row.id), chars: text.length } }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
