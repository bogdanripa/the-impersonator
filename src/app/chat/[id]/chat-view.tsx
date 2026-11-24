"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import type { PersonaData } from "@/lib/client-types";
import { buildIndex, EvidenceList, subjectTier, type EvidenceIndex } from "@/components/evidence";
import { TierBadge } from "@/components/ui";
import { Markdown } from "@/components/markdown";
import { CompanyLogo, PersonaPhoto, type CardPersona } from "@/components/persona-card";

type Message = {
  id: string; role: string; content: string; innerThought: string | null;
  insightIds: string[]; storyIds: string[]; ungrounded: boolean; createdAt: string;
  segments: { text: string; insightIds: string[]; storyIds: string[]; liveIds?: string[]; noEvidence: boolean }[] | null;
  liveIds?: string[];
};
type Live = { id: string; url: string; title: string | null; quote: string; speaker: string; isAnchor: boolean; retrievedAt: string; query: string };
type Conversation = {
  id: string; personaId: string; personaVersion: number; title: string | null; createdBy: string | null; createdAt: string;
};

/** Full-screen, immersive conversation with one persona. */
export default function ChatView() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [persona, setPersona] = useState<PersonaData | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showThoughts, setShowThoughts] = useState(false);
  const [showLegend, setShowLegend] = useState(false);
  const [canWrite, setCanWrite] = useState(true);
  const [live, setLive] = useState<Map<string, Live>>(new Map());
  const [copied, setCopied] = useState(false);
  const scroller = useRef<HTMLElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    (async () => {
      try {
        const c = await api<{ conversation: Conversation; messages: Message[]; canWrite: boolean; live: Live[] }>(`/api/conversations/${id}`);
        setConversation(c.conversation);
        setCanWrite(c.canWrite);
        setLive(new Map(c.live.map((l) => [l.id, l])));
        setMessages(c.messages);
        setPersona(await api<PersonaData>(`/api/personas/${c.conversation.personaId}`));
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, [id]);

  // Scroll only the conversation pane (never the window) to the newest message.
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, pending]);

  // Grow the input with its content, up to a limit.
  useEffect(() => {
    const el = input.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [text]);

  const idx = useMemo(() => (persona ? buildIndex(persona) : null), [persona]);
  const icp = persona?.persona.icp;
  const name = icp?.anchor_name ?? persona?.persona.name ?? "";

  async function send(raw: string) {
    const msg = raw.trim();
    if (!msg || pending) return;
    setText("");
    setPending(msg);
    setError(null);
    try {
      const r = await api<{ user: Message; persona: Message }>(`/api/conversations/${id}/messages`, { body: { text: msg } });
      if (r.persona.liveIds?.length) {
        const c = await api<{ live: Live[] }>(`/api/conversations/${id}`);
        setLive(new Map(c.live.map((l) => [l.id, l])));
      }
      setMessages((m) => [...m, r.user, r.persona]);
    } catch (err) {
      setError((err as Error).message);
      setText(msg);
    } finally {
      setPending(null);
      input.current?.focus();
    }
  }

  async function newConversation() {
    if (!persona) return;
    try {
      const { id: cid } = await api<{ id: string }>(`/api/personas/${persona.persona.id}/conversations`, { method: "POST" });
      router.push(`/chat/${cid}`);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (!persona || !idx) {
    return <div className="flex h-dvh items-center justify-center text-sm text-zinc-500">{error ?? "Loading…"}</div>;
  }

  const starters = (icp?.research_questions ?? []).slice(0, 4);

  return (
    <div className="fixed inset-0 flex flex-col bg-[var(--background)]">
      {/* Top bar */}
      <header className="flex shrink-0 items-center gap-3 border-b border-zinc-200 px-3 py-2 dark:border-zinc-800 sm:px-4">
        <Link
          href={`/personas/${persona.persona.id}`}
          className="rounded p-1 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
          aria-label="Back to profile"
        >
          ←
        </Link>
        <Avatar persona={persona.persona} size="md" />
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold leading-tight">{name}</div>
          <div className="truncate text-xs text-zinc-500">
            {icp ? `${icp.anchor_role} · ${icp.anchor_company}` : "Simulation from public statements"}
            {conversation && conversation.personaVersion !== persona.persona.version && " · earlier persona version"}
          </div>
        </div>
        <div className="relative flex items-center gap-2">
          <label className="hidden cursor-pointer items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400 sm:flex">
            <input type="checkbox" checked={showThoughts} onChange={(e) => setShowThoughts(e.target.checked)} />
            Inner thoughts
          </label>
          <button
            onClick={() => setShowLegend((v) => !v)}
            className="rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700"
            aria-expanded={showLegend}
          >
            Badges
          </button>
          <button
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(window.location.href);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              } catch {
                prompt("Copy this link to share the conversation with your team:", window.location.href);
              }
            }}
            title="Copy a link teammates can open (read-only)"
            className="rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700"
          >
            {copied ? "Link copied" : "Share"}
          </button>
          <button onClick={newConversation} className="rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700">
            New chat
          </button>
          {showLegend && (
            <div className="absolute right-0 top-9 z-10 w-72 space-y-2 rounded-lg border border-zinc-200 bg-[var(--background)] p-3 text-xs shadow-lg dark:border-zinc-800">
              <div className="flex items-center gap-2"><TierBadge tier="anchor" /> what {name} actually said</div>
              <div className="flex items-center gap-2"><TierBadge tier="company" /> official company material</div>
              <div className="flex items-center gap-2"><TierBadge tier="peer" /> similar people, never their own experience</div>
              <div className="flex items-center gap-2"><TierBadge tier="live" /> looked up online during this chat, verified against the page</div>
              <p className="text-zinc-500">Replies that cite no evidence are flagged as ungrounded. Each conversation starts fresh.</p>
              <label className="flex items-center gap-2 sm:hidden">
                <input type="checkbox" checked={showThoughts} onChange={(e) => setShowThoughts(e.target.checked)} />
                Show inner thoughts
              </label>
            </div>
          )}
        </div>
      </header>

      {/* Conversation */}
      <main ref={scroller} className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6">
          {messages.length === 0 && !pending && (
            <div className="flex flex-col items-center pt-10 text-center">
              <Avatar persona={persona.persona} size="lg" />
              <h1 className="mt-3 text-xl font-semibold">{name}</h1>
              {icp && (
                <p className="mt-1 flex items-center gap-1.5 text-sm text-zinc-500">
                  {icp.anchor_role} · <CompanyLogo persona={persona.persona} /> {icp.anchor_company}
                </p>
              )}
              {(persona.persona.tagline || persona.persona.summary) && (
                <p className="mt-3 max-w-xl text-sm text-zinc-600 dark:text-zinc-400">{persona.persona.tagline ?? persona.persona.summary}</p>
              )}
              <p className="mt-2 text-xs text-zinc-500">A simulation built only from public statements. This conversation starts fresh.</p>
              {canWrite && starters.length > 0 && (
                <div className="mt-6 grid w-full max-w-2xl gap-2 sm:grid-cols-2">
                  {starters.map((q) => (
                    <button
                      key={q}
                      onClick={() => send(q)}
                      className="rounded-lg border border-zinc-200 p-3 text-left text-sm hover:bg-zinc-100 dark:border-zinc-800 dark:hover:bg-zinc-900"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {messages.map((m) =>
            m.role === "user" ? (
              <UserMessage key={m.id} content={m.content} />
            ) : (
              <PersonaMessage key={m.id} m={m} idx={idx} live={live} card={persona.persona} showThoughts={showThoughts} />
            ),
          )}

          {pending && (
            <>
              <UserMessage content={pending} />
              <div className="flex items-center gap-3 text-sm text-zinc-500">
                <Avatar persona={persona.persona} size="sm" />
                <span className="animate-pulse">{name} is thinking… (may look things up online)</span>
              </div>
            </>
          )}
        </div>
      </main>

      {/* Composer */}
      <footer className="shrink-0 border-t border-zinc-200 dark:border-zinc-800">
        {!canWrite ? (
          <div className="mx-auto flex w-full max-w-3xl flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
            <span className="text-zinc-500">
              Shared conversation{conversation?.createdBy ? ` started by ${conversation.createdBy}` : ""}
              {conversation?.createdAt ? ` on ${new Date(conversation.createdAt).toLocaleDateString()}` : ""}. Read-only.
            </span>
            <button onClick={newConversation} className="rounded-lg bg-zinc-900 px-4 py-2 text-white dark:bg-zinc-100 dark:text-zinc-900">
              Start my own conversation
            </button>
          </div>
        ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(text);
          }}
          className="mx-auto flex w-full max-w-3xl items-end gap-2 px-4 py-3"
        >
          <textarea
            ref={input}
            rows={1}
            value={text}
            autoFocus
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send(text);
              }
            }}
            placeholder={`Message ${name}…`}
            className="max-h-[200px] flex-1 resize-none rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm leading-relaxed dark:border-zinc-700"
          />
          <button
            type="submit"
            disabled={!!pending || !text.trim()}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
          >
            Send
          </button>
        </form>
        )}
        {error && <p className="mx-auto max-w-3xl px-4 pb-2 text-sm text-red-600">{error}</p>}
      </footer>
    </div>
  );
}

function Avatar({ persona, size }: { persona: CardPersona; size: "sm" | "md" | "lg" }) {
  return <PersonaPhoto persona={persona} size={size === "lg" ? "xl" : size} />;
}

function UserMessage({ content }: { content: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl bg-zinc-900 px-4 py-2 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900">
        {content}
      </div>
    </div>
  );
}

const TIER_HIGHLIGHT: Record<string, string> = {
  anchor: "bg-emerald-500/15 ring-1 ring-emerald-500/40",
  company: "bg-indigo-500/15 ring-1 ring-indigo-500/40",
  peer: "bg-amber-500/15 ring-1 ring-amber-500/40",
  live: "bg-sky-500/15 ring-1 ring-sky-500/40",
};

function PersonaMessage({
  m, idx, live, card, showThoughts,
}: { m: Message; idx: EvidenceIndex; live: Map<string, Live>; card: CardPersona; showThoughts: boolean }) {
  const [open, setOpen] = useState(false);
  const [hoverTier, setHoverTier] = useState<string | null>(null);
  const tiersOf = (insightIds: string[], storyIds: string[], liveIds: string[] = []) => {
    const t = new Set<string>(
      [...insightIds.map((i) => idx.insights.get(i)?.subjectId), ...storyIds.map((x) => idx.stories.get(x)?.subjectId)]
        .filter((x): x is string => !!x)
        .map((sid) => subjectTier(idx.subjects.get(sid))),
    );
    if (liveIds.length) t.add("live");
    return t;
  };
  const liveIds = m.liveIds ?? [];
  const tiers = tiersOf(m.insightIds, m.storyIds, liveIds);
  const n = m.insightIds.length + m.storyIds.length + liveIds.length;
  const segments = m.segments?.length ? m.segments : null;

  return (
    <div className="flex gap-3">
      <div className="mt-0.5">
        <Avatar persona={card} size="sm" />
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        {showThoughts && m.innerThought && (
          <div className="rounded-lg border border-dashed border-zinc-300 px-3 py-2 text-sm italic text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
            <span className="font-medium not-italic">Thinking: </span>
            {m.innerThought}
          </div>
        )}
        <div className="text-[15px]">
          {segments ? (
            <div className="space-y-2">
              {segments.map((seg, i) => {
                const segTiers = tiersOf(seg.insightIds, seg.storyIds, seg.liveIds ?? []);
                const cited = seg.insightIds.length + seg.storyIds.length + (seg.liveIds?.length ?? 0) > 0;
                const lit = hoverTier && segTiers.has(hoverTier);
                return (
                  <div
                    key={i}
                    title={!cited && !seg.noEvidence ? "No evidence cited for this paragraph" : undefined}
                    className={`-mx-2 rounded-md px-2 py-0.5 transition ${
                      hoverTier ? (lit ? TIER_HIGHLIGHT[hoverTier] : "opacity-35") : ""
                    } ${!cited && !seg.noEvidence ? "border-l-2 border-dashed border-red-400/70" : ""}`}
                  >
                    <Markdown>{seg.text}</Markdown>
                  </div>
                );
              })}
            </div>
          ) : (
            <Markdown>{m.content}</Markdown>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
          {m.ungrounded ? (
            <span className="rounded bg-red-100 px-1.5 py-0.5 font-medium text-red-700 dark:bg-red-950 dark:text-red-300">
              ⚠ Ungrounded: cites no evidence. Don&apos;t treat as fact.
            </span>
          ) : n === 0 ? (
            <span>No public evidence on this; they said so.</span>
          ) : (
            <>
              <button onClick={() => setOpen((v) => !v)} className="underline underline-offset-2 hover:text-zinc-900 dark:hover:text-zinc-100">
                {open ? "Hide" : "Grounded in"} {n} {n === 1 ? "quote" : "quotes"}
              </button>
              {[...tiers].map((t) => (
                <span
                  key={t}
                  tabIndex={segments ? 0 : undefined}
                  onMouseEnter={() => segments && setHoverTier(t)}
                  onMouseLeave={() => setHoverTier(null)}
                  onFocus={() => segments && setHoverTier(t)}
                  onBlur={() => setHoverTier(null)}
                  className={segments ? "cursor-help" : undefined}
                  title={segments ? "Highlight the paragraphs this evidence shaped" : undefined}
                >
                  <TierBadge tier={t} />
                </span>
              ))}
            </>
          )}
        </div>
        {open && (
          <>
            {liveIds.length > 0 && (
              <ul className="mt-2 space-y-2">
                {liveIds.map((lid) => live.get(lid)).filter((l): l is Live => !!l).map((l) => (
                  <li key={l.id} className="rounded border border-sky-300/60 p-2 text-sm dark:border-sky-800">
                    <blockquote className="border-l-2 border-sky-400 pl-2 italic">“{l.quote}”</blockquote>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                      <TierBadge tier="live" />
                      <span>{l.speaker}{l.isAnchor ? " (their own words)" : ""}</span>
                      <a href={l.url} target="_blank" rel="noreferrer noopener" className="underline">
                        {l.title ?? new URL(l.url).hostname}
                      </a>
                      <span>· retrieved live {new Date(l.retrievedAt).toLocaleString()}, verified against the page</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <EvidenceList insightIds={m.insightIds} storyIds={m.storyIds} idx={idx} />
          </>
        )}
      </div>
    </div>
  );
}
