import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { findConversation } from "@/lib/access";
import { handleError, jsonError } from "@/lib/http";

/**
 * Continues a shared conversation as the viewer's own copy: same persona version, the full history
 * and its live evidence. The original is left untouched.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/conversations/[id]/fork">) {
  try {
    const { id } = await ctx.params;
    const source = await findConversation(request, id);
    if (!source) return jsonError("Conversation not found", 404);
    const viewer = request.headers.get("x-user-email");

    const newId = await db.transaction(async (tx) => {
      const messages = await tx
        .select()
        .from(schema.messages)
        .where(eq(schema.messages.conversationId, id))
        .orderBy(asc(schema.messages.createdAt));
      // A question still waiting for its reply stays with the original.
      while (messages.at(-1)?.role === "user") messages.pop();
      const live = await tx.select().from(schema.liveEvidence).where(eq(schema.liveEvidence.conversationId, id));

      const [copy] = await tx
        .insert(schema.conversations)
        .values({ personaId: source.personaId, personaVersion: source.personaVersion, title: source.title, createdBy: viewer, forkedFrom: id })
        .returning({ id: schema.conversations.id });

      const liveMap = new Map<string, string>();
      for (const l of live) {
        const { id: oldId, conversationId: _c, ...rest } = l;
        void _c;
        const [row] = await tx
          .insert(schema.liveEvidence)
          .values({ ...rest, conversationId: copy.id })
          .returning({ id: schema.liveEvidence.id });
        liveMap.set(oldId, row.id);
      }
      const remap = (ids: string[] | undefined) => (ids ?? []).map((x) => liveMap.get(x)).filter((x): x is string => !!x);
      if (messages.length) {
        await tx.insert(schema.messages).values(
          messages.map(({ id: _id, conversationId: _cid, ...m }) => {
            void _id;
            void _cid;
            return {
              ...m,
              conversationId: copy.id,
              liveIds: remap(m.liveIds),
              segments: m.segments?.map((seg) => ({ ...seg, liveIds: remap(seg.liveIds) })) ?? null,
            };
          }),
        );
      }
      return copy.id;
    });
    return NextResponse.json({ id: newId });
  } catch (err) {
    return handleError(err);
  }
}
