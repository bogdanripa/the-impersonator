# Seed personas

Real seed personas are **not committed**. Everything in this folder except this README and
`example.json` (a fictional format sample) is git-ignored, including `cache/`.

Research can be done offline (by a person or an agent), but it gets the same guarantees as the app:

1. `npm run fetch-text -- <url>` reads a page with the app's own fetcher and caches the exact text
   in `seeds/cache/`. Copy quotes only from that text.
2. Write `seeds/<name>.json` in the format of `example.json`: the persona setup, sources with
   verbatim quotes and stories, and a synthesis that cites them by id.
3. `npm run seed:verify -- seeds/<name>.json` dry-runs the importer: identity checks, word-for-word
   quote verification, speaker checks, and the synthesis evidence rules.
4. `npm run seed -- seeds/<name>.json [--replace]` imports it into `DATABASE_URL`. Anything that
   fails verification is logged as a rejection and never used.

To seed production, point `DATABASE_URL` at the production database for that one command.
