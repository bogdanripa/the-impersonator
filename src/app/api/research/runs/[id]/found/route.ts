import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { logEvent } from "@/lib/events";
import { handleError, jsonError } from "@/lib/http";
import { researchApiAuthorized, researchUnauthorized } from "@/lib/research-runs";

const TIERS = new Set(["anchor", "company", "peer"]);

/**
 * Routine-facing: sources found so far, shown live on the persona page as "found, not yet checked".
 * Nothing here is trusted or imported: the submitted research is verified from scratch at the end.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/research/runs/[id]/found">) {
  if (!researchApiAuthorized(request)) return researchUnauthorized(request);
  try {
    const { id } = await ctx.params;
    const run = await db.query.researchRuns.findFirst({ where: eq(schema.researchRuns.id, id) });
    if (!run) return jsonError("Run not found", 404);
    if (run.status === "failed") return jsonError(`Run is failed: ${run.detail ?? "no reason recorded"}. Stop working on it.`, 409);
    if (run.status !== "requested" && run.status !== "researching") return NextResponse.json({ ok: true, ignored: `run is ${run.status}` });
    const body = (await request.json().catch(() => ({}))) as { sources?: { url?: string; tier?: string; title?: string; subject?: string }[] };
    const rows = (body.sources ?? [])
      .filter((s) => typeof s.url === "string" && /^(https?:\/\/|attachment:)/.test(s.url) && TIERS.has(s.tier ?? ""))
      .slice(0, 50)
      .map((s) => ({
        runId: id,
        url: s.url!.slice(0, 2000),
        tier: s.tier!,
        title: s.title?.slice(0, 300) || null,
        subjectName: s.subject?.slice(0, 200) || null,
      }));
    if (!rows.length) return jsonError("Send sources: [{ url, tier: anchor|company|peer, title?, subject? }]");
    await db
      .insert(schema.runFindings)
      .values(rows)
      .onConflictDoUpdate({ target: [schema.runFindings.runId, schema.runFindings.url], set: { tier: schema.runFindings.tier } });
    await logEvent({
      kind: "research.found",
      message: `Claude found ${rows.length} source${rows.length === 1 ? "" : "s"}: ${rows.map((r) => r.title ?? r.url).join("; ").slice(0, 300)}`,
      actor: "routine",
      personaId: run.personaId,
      runId: id,
      data: { sources: rows.map(({ url, tier, title, subjectName }) => ({ url, tier, title, subjectName })) },
    });
    return NextResponse.json({ ok: true, recorded: rows.length });
  } catch (err) {
    return handleError(err);
  }
}
