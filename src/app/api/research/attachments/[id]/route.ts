import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { handleError, jsonError } from "@/lib/http";
import { researchApiAuthorized, researchUnauthorized } from "@/lib/research-runs";

/**
 * The exact stored text of an uploaded file, for the research routine's fetch-text (which has no
 * database). Same bearer token as the rest of the research API.
 */
export async function GET(request: Request, ctx: RouteContext<"/api/research/attachments/[id]">) {
  try {
    if (!researchApiAuthorized(request)) return researchUnauthorized(request);
    const { id } = await ctx.params;
    if (!/^[0-9a-f-]{36}$/i.test(id)) return jsonError("Not found", 404);
    const row = await db.query.attachments.findFirst({ where: eq(schema.attachments.id, id) });
    if (!row) return jsonError("Not found", 404);
    return new Response(row.text, {
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "x-attachment-title": encodeURIComponent(row.title ?? row.filename),
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    return handleError(err);
  }
}
