import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";

/** Serves the stored photo (signed-in users only, via the proxy gate). */
export async function GET(_request: Request, ctx: RouteContext<"/api/personas/[id]/photo">) {
  const { id } = await ctx.params;
  const [row] = await db
    .select({ data: schema.personas.photoData, type: schema.personas.photoType })
    .from(schema.personas)
    .where(eq(schema.personas.id, id));
  if (!row?.data || !row.type) return new Response(null, { status: 404 });
  return new Response(Buffer.from(row.data, "base64"), {
    headers: {
      "content-type": row.type,
      "cache-control": "private, max-age=86400",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'",
    },
  });
}
