/**
 * Writes the short 2-3 word title for existing conversations that don't have one yet.
 * Usage: npm run conversation-titles
 */
import { isNull } from "drizzle-orm";
import { db, schema } from "../src/lib/db";
import { refreshConversationTitle } from "../src/lib/chat";

async function main() {
  const rows = await db
    .select({ id: schema.conversations.id, title: schema.conversations.title })
    .from(schema.conversations)
    .where(isNull(schema.conversations.titleGeneratedAt));
  for (const c of rows) {
    try {
      const title = await refreshConversationTitle(c.id, { force: true });
      console.log(`${title ? "titled" : "skip  "} ${c.id}${title ? `: ${title}` : " (no replies)"}  (was: ${c.title ?? "untitled"})`);
    } catch (err) {
      console.log(`FAILED ${c.id}: ${(err as Error).message}`);
    }
  }
}

main().then(() => process.exit(0), (err) => {
  console.error(err);
  process.exit(1);
});
