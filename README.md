# The Impersonator

Talk to a simulation of a real marketing leader, built **only** from what they and people like them
actually said in public. No guessing, no hallucinated facts: every claim traces back to a verbatim
quote on a page we fetched ourselves.

Two flows:

1. **Create ICP.** Pick a real person (real name, LinkedIn, company), representative of the segment.
   The app finds their own interviews/transcripts/articles, official company material (filings,
   earnings calls, job posts), and peers. You review the sources, then every quote is verified
   word-for-word before it can shape the persona.
2. **Chat with ICP.** In-character answers with evidence badges (their own words / company / peers),
   a hidden inner monologue, and an explicit "unknown" when nothing public covers the question
   (e.g. budgets they've never disclosed). Each conversation starts fresh.

See [docs/PRODUCT.md](docs/PRODUCT.md) for product decisions and research notes.

## How grounding is enforced

- Sources are fetched by our server (never "remembered" by the model), stored in full, hashed.
- Extraction returns quotes; `src/lib/verify.ts` accepts a quote only if it appears verbatim in the
  stored text (case/punctuation/whitespace aside), has ≥ 8 words, no ellipses or brackets, and is
  spoken by the right person. Everything rejected is logged in `rejections`.
- Persona elements and research answers must cite verified evidence codes; uncited items are dropped.
  Peer-only patterns need ≥ `MIN_SUBJECTS_PER_TRAIT` peers. The anchor's history can only come
  from their own stories.
- Chat replies cite evidence IDs; the server validates them. A reply citing nothing is flagged
  **ungrounded** in the UI.

## Stack

Next.js 16 (App Router) · TypeScript · Postgres + Drizzle · Vercel Workflow (durable research jobs) ·
Azure OpenAI / OpenAI Responses API with web search · Google sign-in (Workspace domains only).

## Local development

```bash
cp .env.example .env.local        # fill in values; Azure and Google keys can live in .env
docker compose up -d              # Postgres on localhost:5433
npm install
npm run db:migrate
npm run dev
```

Google OAuth client: add `http://localhost:3000/api/auth/callback` (and the production URL's
`/api/auth/callback`) as authorized redirect URIs. Only `ALLOWED_EMAIL_DOMAINS` Workspace accounts
can sign in (default `genezio.com,genez.io`).

Workflow runs locally on the "local world"; inspect runs with `npx workflow web`.

## Seeding personas

Seed files contain real people's details and are **git-ignored**. See [seeds/README.md](seeds/README.md).

```bash
npm run seed -- seeds/personas.json
```

## Deploying to Vercel

1. Create the project and add Postgres (Neon) from the Vercel Marketplace; it sets `DATABASE_URL`.
2. Set env vars: `OPENAI_PROVIDER`, `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_ENDPOINT`, `OPENAI_MODEL`,
   `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `AUTH_SECRET`, `ALLOWED_EMAIL_DOMAINS`, `APP_URL`.
3. `npm run build` runs migrations before `next build`.
