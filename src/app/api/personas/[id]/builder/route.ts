import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import type { BuilderMessage } from "@/lib/builder";
import { db, schema } from "@/lib/db";
import { findPersona } from "@/lib/access";
import { builderTurn } from "@/lib/builder";
import { handleError, jsonError } from "@/lib/http";
import { sameName } from "@/lib/research";
import { nameKey } from "@/lib/verify";
import { refreshPersonaMedia } from "@/lib/media";
import { errorData, logEvent } from "@/lib/events";

export const maxDuration = 300;

/**
 * The persona chat. On a new persona it defines the setup; on a researched persona it's an
 * update chat whose revised setup stays pending until the update research is launched.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/personas/[id]/builder">) {
  const started = Date.now();
  const actor = request.headers.get("x-user-email");
  let personaId: string | null = null;
  let userText = "";
  try {
    const { id } = await ctx.params;
    personaId = id;
    const { text } = (await request.json().catch(() => ({}))) as { text?: string };
    if (!text?.trim()) return jsonError("Message is empty");
    userText = text.trim();
    const persona = await findPersona(request, id);
    if (!persona) return jsonError("Persona not found", 404);

    const isUpdate = persona.version > 0;
    if (!isUpdate && persona.status !== "draft") return jsonError("The setup is locked while research runs.", 409);
    if (isUpdate && !["ready", "failed"].includes(persona.status)) return jsonError("Wait for the current research to finish.", 409);

    const history = persona.builderMessages as BuilderMessage[];
    const current = isUpdate ? (persona.pendingIcp ?? persona.icp) : null;
    const files = await db
      .select({ id: schema.attachments.id, filename: schema.attachments.filename, text: schema.attachments.text })
      .from(schema.attachments)
      .where(eq(schema.attachments.personaId, id))
      .orderBy(asc(schema.attachments.createdAt));
    const { messages, reply, icp, trace } = await builderTurn(history, text.trim(), current, files);

    let proposal = icp;
    let note: string | null = null;
    if (proposal && isUpdate && persona.icp) {
      // An update can't swap the person being simulated.
      const samePerson = sameName(nameKey(proposal.anchor_name), nameKey(persona.icp.anchor_name));
      if (!samePerson) {
        proposal = null;
        note = "An update can't change the person being simulated. Create a new persona for someone else.";
      }
    }

    await db
      .update(schema.personas)
      .set({
        builderMessages: note ? [...messages, { role: "assistant", content: note }] : messages,
        ...(proposal && !isUpdate ? { icp: proposal, name: proposal.persona_name } : {}),
        ...(proposal && isUpdate ? { pendingIcp: proposal } : {}),
        updatedAt: new Date(),
      })
      .where(eq(schema.personas.id, id));
    // New persona: load the photo and logo for the card as soon as the setup is proposed.
    if (proposal && !isUpdate) await refreshPersonaMedia(id).catch(() => null);
    await logEvent({
      kind: "builder.turn",
      level: trace.refused.length || trace.reads.some((r) => !r.ok) ? "warn" : "info",
      message: proposal
        ? `Setup proposed: ${proposal.anchor_name}, ${proposal.anchor_role} at ${proposal.anchor_company}`
        : trace.refused.length
          ? `Setup without a named person refused (missing ${trace.refused[0]})`
          : "Setup chat reply",
      actor,
      personaId: id,
      durationMs: Date.now() - started,
      data: { mode: isUpdate ? "update" : "create", user: userText, reply: note ?? reply, files: files.length, ...trace, proposal, note },
    });
    return NextResponse.json({ reply: note ?? reply, icp: proposal });
  } catch (err) {
    await logEvent({
      kind: "builder.error", level: "error", message: `Setup chat failed: ${(err as Error).message}`,
      actor, personaId, durationMs: Date.now() - started, data: { user: userText, ...errorData(err) },
    });
    return handleError(err);
  }
}
