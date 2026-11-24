# The Impersonator — product decisions

## What it is
A chat interface for talking to a simulation of a **real, named person** who represents an ICP
(e.g. the CMO of a top UK B2C company), so the team understands that kind of buyer deeply.

## Two flows
1. **Create ICP**
   1. Builder chat: confirm the real person (name, current role, company, LinkedIn URL seen in search),
      check they're **representative** of the segment (not an outlier), define peers, and turn what the
      team wants to learn into **research questions** (e.g. total budget, split across buckets, what they
      own vs delegate, views on AI).
   2. Discovery (three tiers, in parallel):
      - **Anchor**: their own words: podcast transcripts, Q&As, articles they wrote, talks.
      - **Company**: official material: filings (e.g. ad spend), earnings calls, press releases, job posts
        (team structure, reporting lines).
      - **Peers**: similar people, to cover topics the anchor hasn't spoken about.
   3. Candidate review: the user approves/rejects sources and can add URLs.
   4. Verified extraction (see "Non-negotiables").
   5. Synthesis: profile elements + an answer for every research question: answered / partial / **unknown**.
2. **Chat with ICP**: first-person replies plus hidden inner monologue; every reply carries the evidence
   it used, badged by tier.

## Non-negotiables
- **No guessing, no hallucination.** reply → insight/story → verbatim quote → stored source text → URL.
- First-person experiences and opinions come **only** from the anchor's own words. Company material can
  be stated as facts about "my company". Peer material is always framed and badged as "people in roles
  like mine", never as the anchor's own experience.
- "Unknown" is a valid answer. Budgets etc. are never estimated.
- Text only. **No audio transcription** (too expensive); discovery looks for transcript pages.
- **Each conversation starts fresh.** No cross-conversation memory.
- Seed personas (real people's details) never go in the repo; `seeds/` is git-ignored.
- Sign-in: Google Workspace accounts on genezio.com / genez.io only.
- Hosting: Vercel. Models: Azure OpenAI (Responses API + web search).

## Learnings from prior work (researched 2026-11-24)
- Existing synthetic-user tools (Synthetic Users, UXpressia persona chat, Hyperbound for sales roleplay)
  generate personas from an ICP description, i.e. the model's general knowledge. NN/g found such responses
  "too shallow to be useful", and noted mode collapse. Grounding in real interviews is the differentiator.
- Stanford genagents (1,052 interview-grounded agents, 85% GSS replication) and Salesforce InterviewSim
  (2026) both find interview-grounded agents beat profile- or name-based ones.
- InterviewSim: speaker attribution and Q&A structuring matter; even the best setup contradicted held-out
  facts ~6% of the time → evidence badges and ungrounded flags are required.
- Evaluation idea: hold out some of the anchor's interviews, ask the persona the same questions, and score
  contradiction against the held-out answers.

## Transcript availability (checked 2026-11-24)
Most recommended CMO podcasts don't publish text transcripts on their own sites. Readable text exists on
bettercmos.com (full transcripts), podscan.fm (partial, first segment), some show sites, and trade-press
Q&As. Think with Google pages render client-side and can't be read by the fetcher.
