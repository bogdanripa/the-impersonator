"use client";

import { useMemo, useState } from "react";
import { api } from "@/lib/api-client";
import type { PersonaData } from "@/lib/client-types";
import { buildIndex, EvidenceList } from "@/components/evidence";
import { TierBadge } from "@/components/ui";
import { attachmentHref } from "@/lib/attachment-url";

const LANGUAGES = ["English", "Romanian", "French", "German", "Spanish", "Italian", "Portuguese", "Dutch", "Polish"];

type Person = {
  id: string; name: string; role: string | null; organization: string | null; isAnchor: boolean;
  insightIds: string[]; storyIds: string[];
  links: { url: string; label: string }[];
  linkedin: string | null;
  questions: string[];
};

function hostOf(u: string) {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return u;
  }
}

/**
 * Everyone the research found who has spoken about this topic: the person being simulated and
 * their peers. Real people to contact for discovery calls, with what each of them said and a
 * draft first message.
 */
export function PeopleTab({ data }: { data: PersonaData }) {
  const idx = useMemo(() => buildIndex(data), [data]);
  const people = useMemo<Person[]>(() => {
    const list = data.subjects
      .filter((s) => s.kind !== "company")
      .map((s) => {
        const insightIds = data.insights.filter((i) => i.subjectId === s.id).map((i) => i.id);
        const storyIds = data.stories.filter((x) => x.subjectId === s.id).map((x) => x.id);
        const ids = new Set([...insightIds, ...storyIds]);
        const sourceIds = new Set(
          [...data.insights.filter((i) => i.subjectId === s.id), ...data.stories.filter((x) => x.subjectId === s.id)].map((x) => x.sourceId),
        );
        const links = data.sources
          .filter((src) => sourceIds.has(src.id) || src.subjectId === s.id)
          .map((src) => ({ url: attachmentHref(src.url), label: src.title ?? hostOf(src.url), raw: src.url }));
        const linkedin =
          links.find((l) => /linkedin\.com\/in\//i.test(l.raw))?.raw ??
          (s.isAnchor && data.persona.icp?.anchor_linkedin_url ? data.persona.icp.anchor_linkedin_url : null);
        const questions = data.answers
          .filter((a) => [...a.insightIds, ...a.storyIds].some((x) => ids.has(x)))
          .map((a) => a.question);
        return { id: s.id, name: s.name, role: s.role, organization: s.organization, isAnchor: s.isAnchor, insightIds, storyIds, links, linkedin, questions };
      })
      .filter((p) => p.insightIds.length + p.storyIds.length > 0);
    return list.sort((a, b) => Number(b.isAnchor) - Number(a.isAnchor) || b.questions.length - a.questions.length || b.insightIds.length - a.insightIds.length);
  }, [data]);

  if (!people.length) return <p className="text-sm text-zinc-500">No people found yet. They appear once research has verified what they said.</p>;
  const peers = people.filter((p) => !p.isAnchor).length;
  return (
    <div className="space-y-4">
      <p className="max-w-prose text-sm leading-6 text-zinc-600 dark:text-zinc-400">
        Real people who have spoken publicly about this: {people.some((p) => p.isAnchor) ? "the person this persona simulates and " : ""}
        {peers} {peers === 1 ? "peer" : "peers"} in similar roles. Good candidates for real discovery calls. Each card shows what they said and
        which of your research questions it touches; draft a first message to ask for a short call.
      </p>
      <ul className="space-y-3">
        {people.map((p) => (
          <PersonCard key={p.id} p={p} idx={idx} personaId={data.persona.id} />
        ))}
      </ul>
    </div>
  );
}

function PersonCard({ p, idx, personaId }: { p: Person; idx: ReturnType<typeof buildIndex>; personaId: string }) {
  const [showQuotes, setShowQuotes] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const n = p.insightIds.length + p.storyIds.length;
  return (
    <li className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-base font-semibold">{p.name}</span>
            <TierBadge tier={p.isAnchor ? "anchor" : "peer"} />
          </div>
          {(p.role || p.organization) && (
            <div className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-400">{[p.role, p.organization].filter(Boolean).join(" · ")}</div>
          )}
        </div>
        <div className="flex w-full gap-2 sm:w-auto">
          {p.linkedin && (
            <a
              href={p.linkedin}
              target="_blank"
              rel="noreferrer noopener"
              className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-center text-sm dark:border-zinc-700 sm:flex-none"
            >
              LinkedIn ↗
            </a>
          )}
          <button
            onClick={() => setDrafting((v) => !v)}
            className="flex-1 rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900 sm:flex-none"
          >
            {drafting ? "Close draft" : "Draft message"}
          </button>
        </div>
      </div>
      {p.questions.length > 0 && (
        <div className="mt-3">
          <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Can speak to</div>
          <ul className="mt-1 space-y-1 text-sm">
            {p.questions.slice(0, 4).map((q) => (
              <li key={q} className="flex gap-2">
                <span aria-hidden className="text-zinc-400">•</span>
                <span className="min-w-0">{q}</span>
              </li>
            ))}
            {p.questions.length > 4 && <li className="text-xs text-zinc-500">and {p.questions.length - 4} more</li>}
          </ul>
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
        <button onClick={() => setShowQuotes((v) => !v)} className="py-1 underline underline-offset-2">
          {showQuotes ? "Hide" : "What they said"} ({n})
        </button>
        {p.links
          .filter((l) => l.url !== p.linkedin)
          .slice(0, 3)
          .map((l) => (
            <a key={l.url} href={l.url} target="_blank" rel="noreferrer noopener" className="underline [overflow-wrap:anywhere]">
              {l.label}
            </a>
          ))}
      </div>
      {showQuotes && <EvidenceList insightIds={p.insightIds} storyIds={p.storyIds} idx={idx} />}
      {drafting && <Draft personaId={personaId} subjectId={p.id} name={p.name} />}
    </li>
  );
}

function Draft({ personaId, subjectId, name }: { personaId: string; subjectId: string; name: string }) {
  const [channel, setChannel] = useState<"linkedin" | "email">("linkedin");
  const [language, setLanguage] = useState("English");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState(false);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const d = await api<{ subject: string; message: string }>(`/api/personas/${personaId}/outreach`, { body: { subjectId, channel, language } });
      setSubject(d.subject);
      setMessage(d.message);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    const text = channel === "email" && subject ? `Subject: ${subject}\n\n${message}` : message;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      prompt("Copy the message:", text);
    }
  }

  return (
    <div className="mt-3 space-y-3 rounded-lg bg-zinc-100 p-3 dark:bg-zinc-900">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <div className="flex overflow-hidden rounded-lg border border-zinc-300 dark:border-zinc-700">
          {(["linkedin", "email"] as const).map((c) => (
            <button
              key={c}
              onClick={() => setChannel(c)}
              className={`px-3 py-1.5 ${channel === c ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : ""}`}
            >
              {c === "linkedin" ? "LinkedIn note" : "Email"}
            </button>
          ))}
        </div>
        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          aria-label="Language"
          className="rounded-lg border border-zinc-300 bg-transparent px-2 py-1.5 dark:border-zinc-700"
        >
          {LANGUAGES.map((l) => <option key={l}>{l}</option>)}
        </select>
        <button
          onClick={generate}
          disabled={busy}
          className="rounded-lg bg-zinc-900 px-3 py-1.5 font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {busy ? "Writing…" : message ? "Rewrite" : `Write to ${name.split(" ")[0]}`}
        </button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {message && (
        <>
          {channel === "email" && (
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              aria-label="Subject"
              className="w-full rounded-lg border border-zinc-300 bg-[var(--background)] px-3 py-2 text-sm dark:border-zinc-700"
            />
          )}
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={channel === "email" ? 8 : 4}
            aria-label="Message"
            className="w-full rounded-lg border border-zinc-300 bg-[var(--background)] px-3 py-2 text-sm leading-6 dark:border-zinc-700"
          />
          <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
            <button onClick={copy} className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm text-zinc-900 dark:border-zinc-700 dark:text-zinc-100">
              {copied ? "Copied" : "Copy"}
            </button>
            {channel === "linkedin" && <span>{message.length}/300 characters (LinkedIn&apos;s limit for a connection note)</span>}
            <span>Fill in the [brackets] and check it before sending.</span>
          </div>
        </>
      )}
    </div>
  );
}
