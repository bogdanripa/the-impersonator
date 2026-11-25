import { findPersona } from "@/lib/access";
import { NextResponse } from "next/server";
import { handleError, jsonError } from "@/lib/http";
import { appOrigin } from "@/lib/auth";
import { DeepResearchError, startDeepResearch } from "@/lib/deep-research";

export const maxDuration = 60;

/** Starts (or refreshes) deep research for a persona by firing the Claude routine. */
export async function POST(request: Request, ctx: RouteContext<"/api/personas/[id]/deep-research">) {
  try {
    const { id } = await ctx.params;
    if (!(await findPersona(request, id))) return jsonError("Persona not found", 404);
    const res = await startDeepResearch(id, { requestedBy: request.headers.get("x-user-email"), origin: appOrigin(request.url) });
    return NextResponse.json({ ok: true, ...res });
  } catch (err) {
    if (err instanceof DeepResearchError) return jsonError(err.message, err.status);
    return handleError(err);
  }
}
