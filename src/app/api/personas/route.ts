import { NextResponse } from "next/server";
import { desc, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { handleError } from "@/lib/http";

export async function GET() {
  try {
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
      .orderBy(desc(schema.personas.updatedAt));
    return NextResponse.json({ personas: rows });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(request: Request) {
  try {
    const [persona] = await db
      .insert(schema.personas)
      .values({ createdBy: request.headers.get("x-user-email") })
      .returning({ id: schema.personas.id });
    return NextResponse.json({ id: persona.id });
  } catch (err) {
    return handleError(err);
  }
}
