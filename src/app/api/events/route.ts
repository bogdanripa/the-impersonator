import { NextResponse } from "next/server";
import { and, desc, eq, inArray, like, lt } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { viewerOrg } from "@/lib/access";
import { handleError } from "@/lib/http";

/** The viewer's company's activity log, newest first. Filters: area (kind prefix), problems, persona, before. */
export async function GET(request: Request) {
  try {
    const q = new URL(request.url).searchParams;
    const area = q.get("area")?.replace(/[^a-z]/g, "");
    const persona = q.get("persona");
    const before = q.get("before");
    const rows = await db
      .select()
      .from(schema.appEvents)
      .where(
        and(
          eq(schema.appEvents.org, viewerOrg(request)),
          area ? like(schema.appEvents.kind, `${area}.%`) : undefined,
          q.get("problems") === "1" ? inArray(schema.appEvents.level, ["warn", "error"]) : undefined,
          persona && /^[0-9a-f-]{36}$/i.test(persona) ? eq(schema.appEvents.personaId, persona) : undefined,
          before && !Number.isNaN(Date.parse(before)) ? lt(schema.appEvents.createdAt, new Date(before)) : undefined,
        ),
      )
      .orderBy(desc(schema.appEvents.createdAt))
      .limit(100);
    return NextResponse.json({ events: rows });
  } catch (err) {
    return handleError(err);
  }
}
