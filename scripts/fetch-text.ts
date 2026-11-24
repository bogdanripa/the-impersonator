/**
 * Fetches a page with the app's own fetcher and caches the exact text the verifier will use.
 * Usage: npm run fetch-text -- <url> [--refresh]
 */
import { getSourceText } from "../src/lib/seed";

async function main() {
  const url = process.argv[2];
  if (!url) throw new Error("Usage: npm run fetch-text -- <url> [--refresh]");
  const t = await getSourceText(url, { refresh: process.argv.includes("--refresh") });
  console.log(`${t.file}\t${t.text.length} chars`);
}

main().then(() => process.exit(0), (err) => {
  console.error(`FAILED: ${(err as Error).message}`);
  process.exit(1);
});
