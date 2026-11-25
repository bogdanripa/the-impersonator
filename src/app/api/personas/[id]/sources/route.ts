import { NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { findPersona } from "@/lib/access";
import { handleError, jsonError } from "@/lib/http";

/** Manually add an interview URL. It's verified exactly like discovered sources. */
export async function POST(request: Request, ctx: RouteContext<"/api/personas/[id]/sources">) {
  try {
    const { id } = await ctx.params;
    const { url, tier } = (await request.json().catch(() => ({}))) as { url?: string; tier?: string };
    if (tier !== "anchor" && tier !== "company" && tier !== "peer") return jsonError("tier must be anchor, company or peer");
    let parsed: URL;
    try {
      parsed = new URL(String(url));
      if (!/^https?:$/.test(parsed.protocol)) throw new Error();
    } catch {
      return jsonError("Enter a valid http(s) URL");
    }
    const persona = await findPersona(request, id);
    if (!persona) return jsonError("Persona not found", 404);
    const [row] = await db
      .insert(schema.sources)
      .values({ personaId: id, tier, url: parsed.toString(), origin: "manual", status: "approved", fitReason: "Added manually" })
      .onConflictDoNothing()
      .returning({ id: schema.sources.id });
    if (!row) return jsonError("That URL is already in the list", 409);
    return NextResponse.json({ id: row.id });
  } catch (err) {
    return handleError(err);
  }
}
