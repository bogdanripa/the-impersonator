import { NextResponse } from "next/server";
import { desc, eq, sql } from "drizzle-orm";
import { viewerOrg } from "@/lib/access";
import { db, schema } from "@/lib/db";
import { handleError } from "@/lib/http";
import { logEvent } from "@/lib/events";
import { processResearchQueue, queuePositions } from "@/lib/research-queue";

export async function GET(request: Request) {
  try {
    // Opportunistically keep the research queue moving.
    await processResearchQueue().catch((err) => console.error("Research queue", err));
    const queue = await queuePositions();
    const rows = await db
      .select({
        id: schema.personas.id,
        name: schema.personas.name,
        status: schema.personas.status,
        statusDetail: schema.personas.statusDetail,
        version: schema.personas.version,
        icp: schema.personas.icp,
        summary: schema.personas.summary,
        tagline: schema.personas.tagline,
        hasPhoto: sql<boolean>`${schema.personas.photoData} is not null`,
        photoSourceUrl: schema.personas.photoSourceUrl,
        hasLogo: sql<boolean>`${schema.personas.logoData} is not null`,
        updatedAt: schema.personas.updatedAt,
      })
      .from(schema.personas)
      .where(eq(schema.personas.org, viewerOrg(request)))
      .orderBy(desc(schema.personas.updatedAt));
    return NextResponse.json({ personas: rows.map((r) => ({ ...r, queuePosition: queue.get(r.id) ?? null })) });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(request: Request) {
  try {
    const [persona] = await db
      .insert(schema.personas)
      .values({ org: viewerOrg(request), createdBy: request.headers.get("x-user-email") })
      .returning({ id: schema.personas.id });
    await logEvent({ kind: "persona.created", message: "New persona started", actor: request.headers.get("x-user-email"), personaId: persona.id });
    return NextResponse.json({ id: persona.id });
  } catch (err) {
    return handleError(err);
  }
}
