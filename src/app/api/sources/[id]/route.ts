import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { handleError, jsonError } from "@/lib/http";

/** Approve or reject a candidate source. */
export async function PATCH(request: Request, ctx: RouteContext<"/api/sources/[id]">) {
  try {
    const { id } = await ctx.params;
    const { status } = (await request.json().catch(() => ({}))) as { status?: string };
    if (status !== "approved" && status !== "rejected") return jsonError("status must be approved or rejected");
    const source = await db.query.sources.findFirst({ where: eq(schema.sources.id, id) });
    if (!source) return jsonError("Source not found", 404);
    if (!["candidate", "approved", "rejected"].includes(source.status)) {
      return jsonError("This source has already been processed", 409);
    }
    await db.update(schema.sources).set({ status }).where(eq(schema.sources.id, id));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}
