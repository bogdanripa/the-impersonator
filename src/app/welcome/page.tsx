import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { TierBadge } from "@/components/ui";

export const metadata: Metadata = {
  title: "The Impersonator: interview your buyer before you meet them",
  description:
    "Talk to a simulation of a real person who represents your ideal customer, built only from what they and people like them have said in public. Every answer traces back to a verbatim quote.",
};

const SIGN_IN = "/api/auth/login?next=/";

/** Public landing page for people who aren't signed in (the proxy shows it at "/"). */
export default function Welcome() {
  return (
    <div className="min-h-dvh bg-[var(--background)] text-[var(--foreground)]">
      <Nav />
      <main>
        <Hero />
        <Problem />
        <Benefits />
        <HowItWorks />
        <Evidence />
        <ForWhom />
        <Teams />
        <Faq />
        <FinalCta />
      </main>
      <footer className="border-t border-zinc-200 px-4 py-8 text-center text-xs text-zinc-500 dark:border-zinc-800">
        The Impersonator builds simulations from public statements. It is not the real person and does not speak for them.
      </footer>
    </div>
  );
}

function SignInButton({ children = "Sign in with Google", large = false }: { children?: ReactNode; large?: boolean }) {
  return (
    <a
      href={SIGN_IN}
      className={`inline-flex items-center justify-center gap-2 rounded-full bg-zinc-900 font-medium text-white transition hover:scale-[1.02] dark:bg-zinc-100 dark:text-zinc-900 ${
        large ? "px-6 py-3 text-base" : "px-4 py-2 text-sm"
      }`}
    >
      <GoogleMark />
      {children}
    </a>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="h-4 w-4 shrink-0">
      <path fill="#EA4335" d="M12 10.2v3.9h5.4c-.2 1.4-1.6 4.1-5.4 4.1-3.3 0-5.9-2.7-5.9-6s2.6-6 5.9-6c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.6 14.6 2.6 12 2.6 6.8 2.6 2.6 6.8 2.6 12s4.2 9.4 9.4 9.4c5.4 0 9-3.8 9-9.2 0-.6-.1-1.1-.2-1.6H12z" />
    </svg>
  );
}

function Nav() {
  return (
    <header className="sticky top-0 z-10 border-b border-zinc-200/70 bg-[var(--background)]/85 backdrop-blur dark:border-zinc-800/70">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/" className="font-semibold tracking-tight">The Impersonator</Link>
        <nav className="flex items-center gap-5 text-sm">
          <a href="#how" className="hidden text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 sm:inline">How it works</a>
          <a href="#evidence" className="hidden text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 sm:inline">Evidence</a>
          <a href="#faq" className="hidden text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 sm:inline">FAQ</a>
          <a href={SIGN_IN} className="rounded-full border border-zinc-300 px-4 py-1.5 font-medium dark:border-zinc-700">Sign in</a>
        </nav>
      </div>
    </header>
  );
}

function Section({ id, eyebrow, title, intro, children }: { id?: string; eyebrow: string; title: string; intro?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-16 border-t border-zinc-200 px-4 py-16 dark:border-zinc-800 sm:py-24">
      <div className="mx-auto max-w-6xl">
        <p className="text-sm font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">{eyebrow}</p>
        <h2 className="mt-2 max-w-3xl text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h2>
        {intro && <p className="mt-4 max-w-2xl text-lg leading-relaxed text-zinc-600 dark:text-zinc-400">{intro}</p>}
        <div className="mt-10">{children}</div>
      </div>
    </section>
  );
}

function Hero() {
  return (
    <section className="px-4 pb-16 pt-12 sm:pb-24 sm:pt-20">
      <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full border border-zinc-300 px-3 py-1 text-xs text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Customer research without the calendar invites
          </p>
          <h1 className="mt-5 text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl lg:text-6xl">
            Interview your buyer before you meet them.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-zinc-600 dark:text-zinc-400">
            Pick a real person who represents your ideal customer. The Impersonator researches everything they, their company and people like
            them have said in public, verifies every quote word for word, and lets your team ask them anything.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <SignInButton large>Start with Google</SignInButton>
            <a href="#how" className="rounded-full px-5 py-3 text-base font-medium text-zinc-700 underline-offset-4 hover:underline dark:text-zinc-300">
              See how it works ↓
            </a>
          </div>
          <p className="mt-4 text-sm text-zinc-500">Any Google account works. Colleagues on your company domain see the same personas automatically.</p>
        </div>
        <ChatPreview />
      </div>
    </section>
  );
}

/** An illustrative conversation (fictional persona), showing the evidence badges. */
function ChatPreview() {
  return (
    <figure className="relative">
      <div aria-hidden className="absolute -inset-4 -z-10 rounded-[2rem] bg-gradient-to-br from-emerald-500/15 via-indigo-500/10 to-fuchsia-500/15 blur-2xl" />
      <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-[var(--background)] shadow-xl dark:border-zinc-800">
        <div className="flex items-center gap-3 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-emerald-600 to-indigo-700 text-sm font-semibold text-white">AM</div>
          <div className="min-w-0">
            <div className="font-semibold leading-tight">Alex Morgan</div>
            <div className="truncate text-xs text-zinc-500">CMO · a consumer-tech brand (illustrative)</div>
          </div>
        </div>
        <div className="space-y-4 p-4 text-sm">
          <div className="flex justify-end">
            <div className="max-w-[85%] rounded-2xl bg-zinc-900 px-4 py-2 text-white dark:bg-zinc-100 dark:text-zinc-900">
              How do you decide which new marketing tools get budget?
            </div>
          </div>
          <div className="space-y-2">
            <p className="rounded-md bg-emerald-500/10 px-2 py-1 leading-relaxed ring-1 ring-emerald-500/30">
              I start with the problem, not the tool. If it doesn&apos;t move retention or acquisition cost within a quarter, it&apos;s a hard sell.
            </p>
            <p className="rounded-md px-2 py-1 leading-relaxed">
              Last year we cut our martech stack by a third and folded two tools into our CRM.
            </p>
            <p className="rounded-md border-l-2 border-dotted border-fuchsia-500 px-2 py-1 leading-relaxed">
              I&apos;ve never said publicly how big that budget is. For people in roles like mine it&apos;s usually a small slice of the
              marketing budget, with a pilot first.
            </p>
            <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-zinc-500">
              <span className="underline underline-offset-2">Grounded in 4 quotes</span>
              <TierBadge tier="anchor" />
              <TierBadge tier="company" />
              <TierBadge tier="guess" />
            </div>
          </div>
        </div>
      </div>
      <figcaption className="mt-3 text-center text-xs text-zinc-500">Example conversation. Each paragraph links to the quotes behind it.</figcaption>
    </figure>
  );
}

function Problem() {
  return (
    <Section
      eyebrow="Why it's different"
      title="Most synthetic personas are a model guessing. This one has receipts."
      intro="Typical AI personas are generated from a short description of your ideal customer, so they answer from the model's general knowledge: plausible, generic and impossible to check. Research on interview-based simulations points the other way: agents grounded in what real people actually said are far more faithful."
    >
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-zinc-200 p-6 dark:border-zinc-800">
          <h3 className="font-semibold text-zinc-500">Persona from a description</h3>
          <ul className="mt-4 space-y-3 text-sm text-zinc-600 dark:text-zinc-400">
            <Li bad>Answers anything with confidence, including things nobody knows</Li>
            <Li bad>No way to tell an insight from an invention</Li>
            <Li bad>Sounds like every other persona built on the same model</Li>
          </ul>
        </div>
        <div className="rounded-2xl border border-emerald-300 bg-emerald-500/5 p-6 dark:border-emerald-900">
          <h3 className="font-semibold">A real person, from their own words</h3>
          <ul className="mt-4 space-y-3 text-sm">
            <Li>Built from interviews, talks, articles and company filings</Li>
            <Li>Every claim traces to a verbatim quote and the page it came from</Li>
            <Li>Says what isn&apos;t public, and labels any educated answer as unconfirmed</Li>
          </ul>
        </div>
      </div>
    </Section>
  );
}

function Li({ children, bad = false }: { children: ReactNode; bad?: boolean }) {
  return (
    <li className="flex gap-3">
      <span aria-hidden className={`mt-0.5 shrink-0 font-semibold ${bad ? "text-zinc-400" : "text-emerald-600 dark:text-emerald-400"}`}>
        {bad ? "✕" : "✓"}
      </span>
      <span>{children}</span>
    </li>
  );
}

const BENEFITS: { title: string; body: string; icon: string }[] = [
  { icon: "🎯", title: "Know your buyer in depth", body: "Their priorities, how they decide, what they own, what frustrates them and how they talk, in one place you can question." },
  { icon: "🔎", title: "Every answer is checkable", body: "Tap any reply to see the exact quotes it rests on, who said them and where. No quote, no claim." },
  { icon: "🧭", title: "Honest about the gaps", body: "When something isn't public (budgets, say), the persona says so first. Any answer beyond the evidence is clearly marked Unconfirmed." },
  { icon: "⚡", title: "No recruiting, no scheduling", body: "Ask the questions you'd save for a customer call, any time, as often as you like, before the real meeting." },
  { icon: "👥", title: "Shared with your team", body: "Everyone on your company's Google domain sees the same personas and can read, continue or print each other's conversations." },
  { icon: "🔁", title: "Gets better as you use it", body: "Questions the evidence couldn't answer are collected. Send them back to research and the persona is rebuilt with what's found." },
];

function Benefits() {
  return (
    <Section eyebrow="Benefits" title="Prepare for the conversations that matter.">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {BENEFITS.map((b) => (
          <div key={b.title} className="rounded-2xl border border-zinc-200 p-6 dark:border-zinc-800">
            <div aria-hidden className="text-2xl">{b.icon}</div>
            <h3 className="mt-3 font-semibold">{b.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{b.body}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}

const STEPS: { title: string; body: string }[] = [
  {
    title: "Pick a real person",
    body: "Name someone who represents your segment, like “the CMO of a top UK retailer”. A short chat confirms who they are, which peers to learn from, and what your team wants to find out. You can upload their LinkedIn profile as a PDF.",
  },
  {
    title: "Research and verification",
    body: "Their own interviews, talks and articles; their company's filings, earnings calls and job posts; and peers in similar roles. You review the sources. Every quote is then checked word for word against the page before it can shape the persona.",
  },
  {
    title: "Meet who they are",
    body: "A profile answers each of your research questions (answered, partial or unknown), and a “soul” captures their beliefs, values, voice and tensions, written only from their own words.",
  },
  {
    title: "Talk, then keep improving",
    body: "Ask anything. Replies come in their voice with evidence badges, an optional inner monologue, and live lookups when something recent comes up. Unanswered questions feed the next round of research.",
  },
];

function HowItWorks() {
  return (
    <Section id="how" eyebrow="How it works" title="From a name to a conversation, in four steps.">
      <ol className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((s, i) => (
          <li key={s.title} className="relative rounded-2xl border border-zinc-200 p-6 dark:border-zinc-800">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-900 text-sm font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900">
              {i + 1}
            </span>
            <h3 className="mt-4 font-semibold">{s.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{s.body}</p>
          </li>
        ))}
      </ol>
    </Section>
  );
}

const TIERS: { tier: string; body: string }[] = [
  { tier: "anchor", body: "What the person actually said: their interviews, talks and writing. The only source for their opinions and experiences." },
  { tier: "company", body: "Official company material, such as filings, earnings calls, press releases and job posts, stated as facts about their company." },
  { tier: "peer", body: "People in similar roles. Always framed as “people like me”, never as the person's own experience." },
  { tier: "live", body: "Looked up online during the conversation and verified against the page before it's used." },
  { tier: "guess", body: "What's typical for people like them when nothing public covers the question. Clearly marked, never presented as fact." },
];

function Evidence() {
  return (
    <Section
      id="evidence"
      eyebrow="Evidence you can see"
      title="Every reply shows where it comes from."
      intro="Each paragraph carries badges for the kind of evidence behind it. Hover or tap a badge to highlight the paragraphs it shaped; open the quotes to read them in context, with a link to the original page."
    >
      <ul className="grid gap-3 md:grid-cols-2">
        {TIERS.map((t) => (
          <li key={t.tier} className="flex items-start gap-4 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
            <span className="mt-0.5 shrink-0"><TierBadge tier={t.tier} /></span>
            <span className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{t.body}</span>
          </li>
        ))}
        <li className="flex items-start gap-4 rounded-xl border border-red-300 p-4 dark:border-red-900">
          <span className="mt-0.5 shrink-0 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-red-700 dark:bg-red-950 dark:text-red-300">
            Ungrounded
          </span>
          <span className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
            A reply that cites nothing is flagged, so nobody mistakes it for fact.
          </span>
        </li>
      </ul>
    </Section>
  );
}

const AUDIENCES: { title: string; body: string }[] = [
  { title: "Product marketing", body: "Test positioning and messaging against how your buyer really talks about their problems." },
  { title: "Sales", body: "Prepare for a first meeting with someone who resembles your prospect, objections included." },
  { title: "Founders and product", body: "Pressure-test ideas with your ideal customer before building or pitching." },
  { title: "Agencies", body: "Get a client's audience right before the brief, with the evidence behind every insight." },
];

function ForWhom() {
  return (
    <Section eyebrow="Who it's for" title="For teams who sell to people they rarely get to talk to.">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {AUDIENCES.map((a) => (
          <div key={a.title} className="rounded-2xl bg-zinc-100 p-6 dark:bg-zinc-900">
            <h3 className="font-semibold">{a.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{a.body}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}

function Teams() {
  return (
    <Section eyebrow="Teams and privacy" title="Your company domain is your workspace.">
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-zinc-200 p-6 dark:border-zinc-800">
          <h3 className="font-semibold">Sign in with Google</h3>
          <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">No setup, no invites. Use your work Google account and you&apos;re in.</p>
        </div>
        <div className="rounded-2xl border border-zinc-200 p-6 dark:border-zinc-800">
          <h3 className="font-semibold">Shared by domain</h3>
          <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
            Everyone at your company sees the same personas and conversations. Share a chat link, or let a colleague continue it as their own copy.
          </p>
        </div>
        <div className="rounded-2xl border border-zinc-200 p-6 dark:border-zinc-800">
          <h3 className="font-semibold">Private to your organization</h3>
          <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
            Other companies never see your personas or conversations. Personal Google accounts get a private space of their own.
          </p>
        </div>
      </div>
    </Section>
  );
}

const FAQ: { q: string; a: string }[] = [
  {
    q: "Is it the real person?",
    a: "No. It's a simulation built from what they've said in public, clearly labelled as such. It doesn't speak for them, and it never invents quotes, events, deals or people.",
  },
  {
    q: "What if they've never talked about my question?",
    a: "The persona says so first. It may then give a first-person answer based on what's typical for people like them, marked Unconfirmed. You always know which is which.",
  },
  {
    q: "Where does the information come from?",
    a: "Public web pages: podcast and talk transcripts, interviews, articles, company filings and job posts, plus anything you upload, such as a LinkedIn profile PDF. We fetch and store each page ourselves and only keep quotes that appear in it word for word.",
  },
  {
    q: "Who can see my conversations?",
    a: "People who sign in with a Google account on your company's domain. Nobody else. Personal accounts are private to their owner.",
  },
  {
    q: "How long does it take to create a persona?",
    a: "Setting it up takes a few minutes of chat. The research runs in the background and can take a while; you can leave the page and come back.",
  },
  {
    q: "Can I keep a record of a conversation?",
    a: "Yes. Conversations are saved for your team, can be shared by link, and print cleanly (or save as PDF) with every reply and its badges.",
  },
];

function Faq() {
  return (
    <Section id="faq" eyebrow="FAQ" title="Questions people ask first.">
      <div className="divide-y divide-zinc-200 rounded-2xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
        {FAQ.map((f) => (
          <details key={f.q} className="group px-5 py-4">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
              {f.q}
              <span aria-hidden className="text-zinc-400 transition group-open:rotate-45">+</span>
            </summary>
            <p className="mt-3 max-w-3xl text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{f.a}</p>
          </details>
        ))}
      </div>
    </Section>
  );
}

function FinalCta() {
  return (
    <section className="border-t border-zinc-200 px-4 py-20 dark:border-zinc-800">
      <div className="mx-auto max-w-3xl text-center">
        <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Who would you like to talk to?</h2>
        <p className="mx-auto mt-4 max-w-xl text-lg text-zinc-600 dark:text-zinc-400">
          Name a real person who represents your buyer. We&apos;ll do the research and show our work.
        </p>
        <div className="mt-8">
          <SignInButton large>Start with Google</SignInButton>
        </div>
      </div>
    </section>
  );
}
