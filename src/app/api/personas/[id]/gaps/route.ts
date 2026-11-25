import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { findPersona } from "@/lib/access";
import { handleError, jsonError } from "@/lib/http";

/** Questions conversations couldn't answer from evidence. */
export async function GET(request: Request, ctx: RouteContext<"/api/personas/[id]/gaps">) {
  try {
    const { id } = await ctx.params;
    if (!(await findPersona(request, id))) return jsonError("Persona not found", 404);
    const gaps = await db
      .select()
      .from(schema.personaGaps)
      .where(eq(schema.personaGaps.personaId, id))
      .orderBy(desc(schema.personaGaps.createdAt))
      .limit(200);
    return NextResponse.json({ gaps });
  } catch (err) {
    return handleError(err);
  }
}
