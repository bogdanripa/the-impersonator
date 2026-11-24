import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { handleError } from "@/lib/http";

/** Questions conversations couldn't answer from evidence. */
export async function GET(_request: Request, ctx: RouteContext<"/api/personas/[id]/gaps">) {
  try {
    const { id } = await ctx.params;
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
