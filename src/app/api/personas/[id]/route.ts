import { NextResponse } from "next/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { handleError, jsonError } from "@/lib/http";
import type { BuilderMessage } from "@/lib/builder";
import { latestRun } from "@/lib/research-runs";

export async function GET(_request: Request, ctx: RouteContext<"/api/personas/[id]">) {
  try {
    const { id } = await ctx.params;
    const persona = await db.query.personas.findFirst({ where: eq(schema.personas.id, id) });
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
    const { builderMessages, ...rest } = persona;
    return NextResponse.json({
      persona: rest,
      builder: builderMessages as BuilderMessage[],
      sources, subjects, elements, answers, insights, stories, rejections, conversations,
      researchRun: run
        ? { id: run.id, mode: run.mode, status: run.status, detail: run.detail, sessionUrl: run.sessionUrl, createdAt: run.createdAt }
        : null,
      deepResearchEnabled: !!(process.env.CLAUDE_ROUTINE_FIRE_URL && process.env.CLAUDE_ROUTINE_TOKEN),
    });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(_request: Request, ctx: RouteContext<"/api/personas/[id]">) {
  try {
    const { id } = await ctx.params;
    await db.delete(schema.personas).where(eq(schema.personas.id, id));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}
