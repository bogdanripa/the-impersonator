import { findPersona } from "@/lib/access";
import { NextResponse } from "next/server";
import { handleError, jsonError } from "@/lib/http";
import { appOrigin } from "@/lib/auth";
import { DeepResearchError, startDeepResearch } from "@/lib/deep-research";
import { logEvent } from "@/lib/events";

export const maxDuration = 60;

/** Starts (or refreshes) deep research for a persona by firing the Claude routine. */
export async function POST(request: Request, ctx: RouteContext<"/api/personas/[id]/deep-research">) {
  let personaId: string | null = null;
  try {
    const { id } = await ctx.params;
    if (!(await findPersona(request, id))) return jsonError("Persona not found", 404);
    personaId = id;
    const res = await startDeepResearch(id, { requestedBy: request.headers.get("x-user-email"), origin: appOrigin(request.url) });
    return NextResponse.json({ ok: true, ...res });
  } catch (err) {
    if (err instanceof DeepResearchError) {
      if (personaId) {
        await logEvent({
          kind: "research.refused", level: "warn", message: `Research not started: ${err.message}`,
          actor: request.headers.get("x-user-email"), personaId, data: { status: err.status },
        });
      }
      return jsonError(err.message, err.status);
    }
    return handleError(err);
  }
}
