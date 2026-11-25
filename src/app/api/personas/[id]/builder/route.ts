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

export const maxDuration = 300;

/**
 * The persona chat. On a new persona it defines the setup; on a researched persona it's an
 * update chat whose revised setup stays pending until the update research is launched.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/personas/[id]/builder">) {
  try {
    const { id } = await ctx.params;
    const { text } = (await request.json().catch(() => ({}))) as { text?: string };
    if (!text?.trim()) return jsonError("Message is empty");
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
    const { messages, reply, icp } = await builderTurn(history, text.trim(), current, files);

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
    return NextResponse.json({ reply: note ?? reply, icp: proposal });
  } catch (err) {
    return handleError(err);
  }
}
