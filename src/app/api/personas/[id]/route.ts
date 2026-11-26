import { NextResponse } from "next/server";
import { and, asc, desc, eq, like, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { findPersona } from "@/lib/access";
import { handleError, jsonError } from "@/lib/http";
import { logEvent } from "@/lib/events";
import type { BuilderMessage } from "@/lib/builder";
import { latestRun } from "@/lib/research-runs";
import { getSoul } from "@/lib/soul";
import { queuePositions } from "@/lib/research-queue";

export async function GET(request: Request, ctx: RouteContext<"/api/personas/[id]">) {
  try {
    const { id } = await ctx.params;
    const persona = await findPersona(request, id);
    if (!persona) return jsonError("Persona not found", 404);

    const [sources, subjects, elements, insights, stories, rejections, conversations, answers] = await Promise.all([
      db
        .select({
          id: schema.sources.id, url: schema.sources.url, title: schema.sources.title, tier: schema.sources.tier,
          publisher: schema.sources.publisher, publishedAt: schema.sources.publishedAt,
          origin: schema.sources.origin, claimedSubjectName: schema.sources.claimedSubjectName,
          claimedSubjectRole: schema.sources.claimedSubjectRole, fitReason: schema.sources.fitReason,
          fitScore: schema.sources.fitScore, status: schema.sources.status, subjectId: schema.sources.subjectId,
          error: schema.sources.error, acceptedCount: schema.sources.acceptedCount,
          rejectedCount: schema.sources.rejectedCount,
        })
        .from(schema.sources)
        .where(eq(schema.sources.personaId, id))
        .orderBy(desc(schema.sources.fitScore)),
      db.select().from(schema.subjects).where(eq(schema.subjects.personaId, id)),
      db
        .select()
        .from(schema.personaElements)
        .where(and(eq(schema.personaElements.personaId, id), eq(schema.personaElements.version, persona.version))),
      db.select().from(schema.insights).where(eq(schema.insights.personaId, id)),
      db.select().from(schema.stories).where(eq(schema.stories.personaId, id)),
      db
        .select({ stage: schema.rejections.stage, count: sql<number>`count(*)::int` })
        .from(schema.rejections)
        .where(eq(schema.rejections.personaId, id))
        .groupBy(schema.rejections.stage),
      db
        .select()
        .from(schema.conversations)
        .where(eq(schema.conversations.personaId, id))
        .orderBy(desc(schema.conversations.createdAt)),
      db
        .select()
        .from(schema.researchAnswers)
        .where(and(eq(schema.researchAnswers.personaId, id), eq(schema.researchAnswers.version, persona.version))),
    ]);

    const run = await latestRun(id);
    // Sources Claude reported while working, until the verified ones replace them.
    const runFindings =
      run && ["requested", "researching", "verifying"].includes(run.status)
        ? await db
            .select({ url: schema.runFindings.url, tier: schema.runFindings.tier, title: schema.runFindings.title, subjectName: schema.runFindings.subjectName })
            .from(schema.runFindings)
            .where(eq(schema.runFindings.runId, run.id))
            .orderBy(asc(schema.runFindings.createdAt))
        : [];
    // Everything the research routine reported for this run, oldest first.
    const runLog = run
      ? await db
          .select({ at: schema.appEvents.createdAt, kind: schema.appEvents.kind, level: schema.appEvents.level, message: schema.appEvents.message })
          .from(schema.appEvents)
          .where(and(eq(schema.appEvents.runId, run.id), like(schema.appEvents.kind, "research.%")))
          .orderBy(asc(schema.appEvents.createdAt))
          .limit(100)
      : [];
    const soul = persona.version > 0 ? await getSoul(id, persona.version) : null;
    const queuePosition = persona.queuedAt ? ((await queuePositions()).get(id) ?? null) : null;
    const { builderMessages, photoData, logoData, ...rest } = persona;
    return NextResponse.json({
      persona: { ...rest, hasPhoto: !!photoData, hasLogo: !!logoData, queuePosition },
      builder: builderMessages as BuilderMessage[],
      sources, subjects, elements, answers, insights, stories, rejections, conversations,
      researchRun: run
        ? {
            id: run.id, mode: run.mode, status: run.status, detail: run.detail, sessionUrl: run.sessionUrl,
            createdAt: run.createdAt, updatedAt: run.updatedAt,
          }
        : null,
      runLog,
      runFindings,
      soul: soul ? { sections: soul.sections, sheet: soul.sheet } : null,
      deepResearchEnabled: !!(process.env.CLAUDE_ROUTINE_FIRE_URL && process.env.CLAUDE_ROUTINE_TOKEN),
    });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(request: Request, ctx: RouteContext<"/api/personas/[id]">) {
  try {
    const { id } = await ctx.params;
    const doomed = await findPersona(request, id);
    if (!doomed) return jsonError("Persona not found", 404);
    await logEvent({
      kind: "persona.deleted", level: "warn", message: `Persona deleted: ${doomed.icp?.anchor_name ?? doomed.name}`,
      actor: request.headers.get("x-user-email"), org: doomed.org, data: { personaId: id, name: doomed.name, version: doomed.version },
    });
    await db.delete(schema.personas).where(eq(schema.personas.id, id));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}
