import { NextResponse } from "next/server";
import { findPersona } from "@/lib/access";
import { errorData, logEvent } from "@/lib/events";
import { handleError, jsonError } from "@/lib/http";
import { CHANNELS, draftOutreach, type Channel } from "@/lib/outreach";

export const maxDuration = 60;

const LANGUAGES = ["English", "Romanian", "French", "German", "Spanish", "Italian", "Portuguese", "Dutch", "Polish"];

/** Drafts a discovery-call request to one of the people the research found. */
export async function POST(request: Request, ctx: RouteContext<"/api/personas/[id]/outreach">) {
  const started = Date.now();
  const { id } = await ctx.params;
  try {
    const persona = await findPersona(request, id);
    if (!persona?.icp) return jsonError("Persona not found", 404);
    const body = (await request.json().catch(() => ({}))) as { subjectId?: string; channel?: string; language?: string };
    if (!body.subjectId || !/^[0-9a-f-]{36}$/i.test(body.subjectId)) return jsonError("Pick a person");
    const channel: Channel = body.channel === "email" ? "email" : "linkedin";
    const language = LANGUAGES.includes(body.language ?? "") ? body.language! : "English";
    const draft = await draftOutreach(id, body.subjectId, { channel, language, icp: persona.icp });
    if (!draft) return jsonError("Person not found", 404);
    await logEvent({
      kind: "persona.outreach_drafted",
      message: `Drafted a ${CHANNELS[channel]} to ${draft.recipient} (${language})`,
      actor: request.headers.get("x-user-email"),
      personaId: id,
      durationMs: Date.now() - started,
      data: { subjectId: body.subjectId, channel, language, draft },
    });
    return NextResponse.json(draft);
  } catch (err) {
    await logEvent({ kind: "persona.outreach_error", level: "error", message: `Couldn't draft a message: ${(err as Error).message}`, actor: request.headers.get("x-user-email"), personaId: id, data: errorData(err) });
    return handleError(err);
  }
}
