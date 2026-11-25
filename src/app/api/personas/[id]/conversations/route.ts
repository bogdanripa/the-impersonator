import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { findPersona } from "@/lib/access";
import { handleError, jsonError } from "@/lib/http";

/** Starts a new conversation. Each one starts fresh, with no memory of others. */
export async function POST(request: Request, ctx: RouteContext<"/api/personas/[id]/conversations">) {
  try {
    const { id } = await ctx.params;
    const persona = await findPersona(request, id);
    if (!persona) return jsonError("Persona not found", 404);
    if (persona.version < 1) return jsonError("This persona isn't ready yet", 409);
    const [row] = await db
      .insert(schema.conversations)
      .values({ personaId: id, personaVersion: persona.version, createdBy: request.headers.get("x-user-email") })
      .returning({ id: schema.conversations.id });
    return NextResponse.json({ id: row.id });
  } catch (err) {
    return handleError(err);
  }
}

/**
 * Lists a persona's conversations (all teammates'), newest first. `q` searches titles, who
 * started them, and the full text of every message.
 */
export async function GET(request: Request, ctx: RouteContext<"/api/personas/[id]/conversations">) {
  try {
    const { id } = await ctx.params;
    if (!(await findPersona(request, id))) return jsonError("Persona not found", 404);
    const q = new URL(request.url).searchParams.get("q")?.trim().slice(0, 200) ?? "";
    const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    const rows = await db.execute<{
      id: string; title: string | null; created_by: string | null; created_at: string; persona_version: number;
      message_count: number; last_at: string | null; snippet: string | null; match: string | null;
    }>(sql`
      select c.id, c.title, c.created_by, c.created_at, c.persona_version,
        (select count(*)::int from messages m where m.conversation_id = c.id) as message_count,
        (select max(m.created_at) from messages m where m.conversation_id = c.id) as last_at,
        (select left(m.content, 220) from messages m where m.conversation_id = c.id and m.role = 'persona'
           order by m.created_at desc limit 1) as snippet,
        ${q ? sql`(select substring(m.content from greatest(strpos(lower(m.content), lower(${q})) - 80, 1) for 220)
           from messages m where m.conversation_id = c.id and m.content ilike ${like}
           order by m.created_at limit 1)` : sql`null`} as match
      from conversations c
      where c.persona_id = ${id}
      ${q ? sql`and (c.title ilike ${like} or c.created_by ilike ${like}
        or exists (select 1 from messages m where m.conversation_id = c.id and m.content ilike ${like}))` : sql``}
      order by coalesce((select max(m.created_at) from messages m where m.conversation_id = c.id), c.created_at) desc
      limit 200`);
    return NextResponse.json({
      conversations: rows.rows.map((r) => ({
        id: r.id, title: r.title, createdBy: r.created_by, createdAt: r.created_at, personaVersion: r.persona_version,
        messageCount: r.message_count, lastAt: r.last_at, snippet: r.match ?? r.snippet,
      })),
    });
  } catch (err) {
    return handleError(err);
  }
}
