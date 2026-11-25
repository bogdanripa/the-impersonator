import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";

/** Which space the viewer is in (see org.ts), and the lookups that only see that space. */

/** The viewer's space, set by the sign-in proxy from the session. */
export function viewerOrg(request: Request): string {
  const org = request.headers.get("x-user-org");
  if (!org) throw new Error("No organization on the request");
  return org;
}

/** The persona, if it belongs to the viewer's space. Anything else reads as "not found". */
export async function findPersona(request: Request, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return undefined;
  return db.query.personas.findFirst({ where: and(eq(schema.personas.id, id), eq(schema.personas.org, viewerOrg(request))) });
}

/** The conversation, if its persona belongs to the viewer's space. */
export async function findConversation(request: Request, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return undefined;
  const conversation = await db.query.conversations.findFirst({ where: eq(schema.conversations.id, id) });
  if (!conversation) return undefined;
  return (await findPersona(request, conversation.personaId)) ? conversation : undefined;
}
