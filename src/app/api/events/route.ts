import { NextResponse } from "next/server";
import { and, desc, eq, inArray, isNull, like, lt, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { viewerOrg } from "@/lib/access";
import { isAdmin } from "@/lib/admin";
import { handleError, jsonError } from "@/lib/http";

/**
 * The activity log, newest first: the viewer's own workspace, or (admins, `all=1`) every workspace,
 * optionally one (`org`, or `org=-` for system-wide events). Filters: area (kind prefix), problems,
 * persona, before. Admins also get a per-workspace overview with the first page.
 */
export async function GET(request: Request) {
  try {
    const q = new URL(request.url).searchParams;
    const all = q.get("all") === "1";
    if (all && !isAdmin(request.headers.get("x-user-email"))) return jsonError("Admins only", 403);
    const area = q.get("area")?.replace(/[^a-z]/g, "");
    const persona = q.get("persona");
    const before = q.get("before");
    const org = q.get("org");
    const scope = !all
      ? eq(schema.appEvents.org, viewerOrg(request))
      : org === "-"
        ? isNull(schema.appEvents.org)
        : org
          ? eq(schema.appEvents.org, org)
          : undefined;
    const events = await db
      .select()
      .from(schema.appEvents)
      .where(
        and(
          scope,
          area ? like(schema.appEvents.kind, `${area}.%`) : undefined,
          q.get("problems") === "1" ? inArray(schema.appEvents.level, ["warn", "error"]) : undefined,
          persona && /^[0-9a-f-]{36}$/i.test(persona) ? eq(schema.appEvents.personaId, persona) : undefined,
          before && !Number.isNaN(Date.parse(before)) ? lt(schema.appEvents.createdAt, new Date(before)) : undefined,
        ),
      )
      .orderBy(desc(schema.appEvents.createdAt))
      .limit(100);
    const overview = all && !before ? await workspaces() : undefined;
    return NextResponse.json({ events, overview });
  } catch (err) {
    return handleError(err);
  }
}

/** Every workspace: personas, conversations, recent activity and problems. */
async function workspaces() {
  const rows = await db.execute<{
    org: string; personas: number; ready: number; conversations: number; messages: number;
    events_7d: number; problems_7d: number; last_activity: string | null; people: number;
  }>(sql`
    with p as (
      select org, count(*)::int as personas, count(*) filter (where version > 0)::int as ready
      from personas group by org
    ), c as (
      select p.org, count(distinct c.id)::int as conversations, count(m.id)::int as messages
      from conversations c join personas p on p.id = c.persona_id left join messages m on m.conversation_id = c.id
      group by p.org
    ), e as (
      select org,
        count(*) filter (where created_at > now() - interval '7 days')::int as events_7d,
        count(*) filter (where created_at > now() - interval '7 days' and level in ('warn', 'error'))::int as problems_7d,
        max(created_at) as last_activity,
        count(distinct actor) filter (where actor like '%@%')::int as people
      from app_events where org is not null group by org
    )
    select coalesce(p.org, e.org) as org, coalesce(p.personas, 0) as personas, coalesce(p.ready, 0) as ready,
      coalesce(c.conversations, 0) as conversations, coalesce(c.messages, 0) as messages,
      coalesce(e.events_7d, 0) as events_7d, coalesce(e.problems_7d, 0) as problems_7d, e.last_activity,
      coalesce(e.people, 0) as people
    from p full outer join e on e.org = p.org left join c on c.org = coalesce(p.org, e.org)
    order by e.last_activity desc nulls last`);
  return rows.rows;
}
