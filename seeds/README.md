# Seed personas

Real seed personas are **not committed**. Everything in this folder except this README and
`example.json` is git-ignored.

1. Copy `example.json` to e.g. `seeds/personas.json` and fill in real people.
2. Run `npm run seed -- seeds/personas.json` (uses `DATABASE_URL` from `.env.local` / `.env`).
3. Each persona is created with its setup pre-filled. Open it in the app and click
   **Confirm & find sources** to start research.

To seed production, point `DATABASE_URL` at the production database for that one command.
Seeding is idempotent per anchor name + company: existing personas are skipped.
