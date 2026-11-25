import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { findPersona } from "@/lib/access";

/** Serves the stored logo (signed-in users only, via the proxy gate). */
export async function GET(request: Request, ctx: RouteContext<"/api/personas/[id]/logo">) {
  const { id } = await ctx.params;
  if (!(await findPersona(request, id))) return new Response(null, { status: 404 });
  const [row] = await db
    .select({ data: schema.personas.logoData, type: schema.personas.logoType })
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
