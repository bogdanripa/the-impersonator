import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { findPersona } from "@/lib/access";
import { handleError, jsonError } from "@/lib/http";

/** The extracted text of an uploaded file, for signed-in teammates (source links in the UI). */
export async function GET(request: Request, ctx: RouteContext<"/api/attachments/[id]">) {
  try {
    const { id } = await ctx.params;
    if (!/^[0-9a-f-]{36}$/i.test(id)) return jsonError("Not found", 404);
    const row = await db.query.attachments.findFirst({ where: eq(schema.attachments.id, id) });
    if (!row || !(await findPersona(request, row.personaId))) return jsonError("Not found", 404);
    return new Response(`${row.filename}\n\n${row.text}`, {
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "private, no-store" },
    });
  } catch (err) {
    return handleError(err);
  }
}
