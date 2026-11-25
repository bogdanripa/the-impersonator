"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
  forkedFrom: string | null; forkedFromBy: string | null;
  /** null (idle) | thinking (reply being written on the server) | failed */
  replyStatus: string | null; replyError: string | null;
};
type ConversationResponse = { conversation: Conversation; messages: Message[]; canWrite: boolean; live: Live[] };

const draftKey = (id: string) => `chat-draft:${id}`;
function readDraft(id: string) {
  try {
    return typeof window === "undefined" ? "" : (localStorage.getItem(draftKey(id)) ?? "");
  } catch {
    return "";
  }
}
function writeDraft(id: string, v: string) {
  try {
    if (v) localStorage.setItem(draftKey(id), v);
    else localStorage.removeItem(draftKey(id));
  } catch {
    // Private mode or storage blocked: the draft just isn't kept.
  }
}
/** Phones and tablets: no autofocus (it pops the keyboard up over the conversation). */
const finePointer = () => typeof window !== "undefined" && window.matchMedia("(pointer: fine)").matches;

/**
 * Sizes the chat to exactly the part of the screen that is visible. iOS Safari doesn't resize the
 * page for the keyboard (it slides the whole page up, pushing the header off screen), and it can
 * keep a widened layout from a previous page, which would push the right edge off screen.
 */
function useVisualViewport(onResize: () => void) {
  const cb = useRef(onResize);
  useEffect(() => {
    cb.current = onResize;
  });
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("chat-locked");
    const vv = window.visualViewport;
    const update = () => {
      if (!vv) return;
      root.style.setProperty("--vvh", `${vv.height}px`);
      root.style.setProperty("--vvt", `${vv.offsetTop}px`);
      root.style.setProperty("--vvw", `${vv.width}px`);
      root.style.setProperty("--vvl", `${vv.offsetLeft}px`);
      cb.current();
    };
    // Undo any sideways scroll carried over from the previous page.
    if (window.scrollX) window.scrollTo(0, window.scrollY);
    update();
    vv?.addEventListener("resize", update);
    vv?.addEventListener("scroll", update);
    return () => {
      vv?.removeEventListener("resize", update);
      vv?.removeEventListener("scroll", update);
      root.classList.remove("chat-locked");
      root.style.removeProperty("--vvh");
      root.style.removeProperty("--vvt");
      root.style.removeProperty("--vvw");
      root.style.removeProperty("--vvl");
    };
  }, []);
}

/** Full-screen, immersive conversation with one persona. */
export default function ChatView() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [persona, setPersona] = useState<PersonaData | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  // Unsent text survives app switches, reloads and the tab being discarded.
  const [text, setText] = useState(() => readDraft(id));
  /** A question on its way to the server (not yet confirmed saved). */
  const [sending, setSending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showThoughts, setShowThoughts] = useState(false);
  const [showLegend, setShowLegend] = useState(false);
  const [canWrite, setCanWrite] = useState(true);
  const [live, setLive] = useState<Map<string, Live>>(new Map());
  const [copied, setCopied] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [busy, setBusy] = useState(false);
  const scroller = useRef<HTMLElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const nearBottom = useRef(true);

  const load = useCallback(async () => {
    const c = await api<ConversationResponse>(`/api/conversations/${id}`);
    setConversation(c.conversation);
    setCanWrite(c.canWrite);
    setLive(new Map(c.live.map((l) => [l.id, l])));
    setMessages(c.messages);
    return c;
  }, [id]);

  useEffect(() => {
    (async () => {
      try {
        const c = await load();
        // A draft left over from a send that did reach the server isn't a draft any more.
        const last = c.messages.at(-1);
        if (last?.role === "user" && last.content === readDraft(id).trim()) {
          writeDraft(id, "");
          setText("");
        }
        setPersona(await api<PersonaData>(`/api/personas/${c.conversation.personaId}`));
        if (c.canWrite && finePointer()) setTimeout(() => input.current?.focus(), 0);
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, [id, load]);

  // Keep the draft while it's being sent; it's only dropped once the server has it.
  useEffect(() => {
    if (text || !sending) writeDraft(id, text);
  }, [id, text, sending]);

  const thinking = conversation?.replyStatus === "thinking";

  // The reply is written on the server: check for it while waiting, and as soon as the page is
  // visible again after switching apps.
  useEffect(() => {
    if (!thinking) return;
    const t = setInterval(() => {
      if (document.visibilityState === "visible") load().catch(() => {});
    }, 2500);
    return () => clearInterval(t);
  }, [thinking, load]);
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") load().catch(() => {});
    };
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("pageshow", refresh);
    window.addEventListener("online", refresh);
    return () => {
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("pageshow", refresh);
      window.removeEventListener("online", refresh);
    };
  }, [load]);

  // Scroll only the conversation pane (never the window) to the newest message: instantly when
  // the conversation opens, smoothly as new messages arrive.
  const opened = useRef(false);
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: opened.current ? "smooth" : "instant" });
    opened.current = true;
  }, [messages, sending, thinking, persona, conversation?.replyStatus]);

  // When the keyboard opens or closes, keep the latest message in view.
  useVisualViewport(() => {
    const el = scroller.current;
    if (el && nearBottom.current) el.scrollTop = el.scrollHeight;
  });

  // Grow the input with its content, up to a limit.
  useEffect(() => {
    const el = input.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, finePointer() ? 200 : 120)}px`;
  }, [text, persona]);

  const idx = useMemo(() => (persona ? buildIndex(persona) : null), [persona]);
  const icp = persona?.persona.icp;
  const name = icp?.anchor_name ?? persona?.persona.name ?? "";

  async function send(raw: string) {
    const msg = raw.trim();
    if (!msg || sending || thinking) return;
    setSending(msg);
    setText("");
    setError(null);
    try {
      await api(`/api/conversations/${id}/messages`, { body: { text: msg } });
      writeDraft(id, "");
      await load().catch(() => {});
    } catch (err) {
      // The question may have reached the server even though the answer to the request didn't.
      const c = await load().catch(() => null);
      const last = c?.messages.at(-1);
      if (last?.role === "user" && last.content === msg) {
        writeDraft(id, "");
      } else {
        setError((err as Error).message);
        setText(msg);
      }
    } finally {
      setSending(null);
      if (finePointer()) input.current?.focus();
    }
  }

  async function retry() {
    setError(null);
    setBusy(true);
    try {
      await api(`/api/conversations/${id}/messages`, { body: { retry: true } });
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function share() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      prompt("Copy this link to share the conversation with your team:", window.location.href);
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

  async function continueAsCopy() {
    setBusy(true);
    try {
      const { id: cid } = await api<{ id: string }>(`/api/conversations/${id}/fork`, { method: "POST" });
      router.push(`/chat/${cid}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  if (!persona || !idx) {
    return <div className="flex h-dvh items-center justify-center text-sm text-zinc-500">{error ?? "Loading…"}</div>;
  }

  const starters = (icp?.research_questions ?? []).slice(0, 4);

  return (
    <div className="fixed left-0 top-0 flex h-[var(--vvh,100dvh)] w-[var(--vvw,100%)] translate-x-[var(--vvl,0px)] translate-y-[var(--vvt,0px)] flex-col overflow-hidden overscroll-none bg-[var(--background)] print:static print:block print:h-auto print:w-auto print:translate-x-0 print:translate-y-0 print:overflow-visible">
      {/* Top bar */}
      <header className="flex shrink-0 items-center gap-2 border-b border-zinc-200 px-2 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] dark:border-zinc-800 sm:gap-3 sm:px-4 print:hidden">
        <Link
          href={`/personas/${persona.persona.id}`}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
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
            {conversation?.forkedFrom && (
              <>
                {" · "}
                <Link href={`/chat/${conversation.forkedFrom}`} className="underline">
                  continued from {conversation.forkedFromBy ?? "a shared"} conversation
                </Link>
              </>
            )}
          </div>
        </div>
        <div className="relative flex shrink-0 items-center gap-2">
          {/* Wide screens: every control inline. */}
          <label className="hidden cursor-pointer items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400 md:flex">
            <input type="checkbox" checked={showThoughts} onChange={(e) => setShowThoughts(e.target.checked)} />
            Inner thoughts
          </label>
          <button
            onClick={() => setShowLegend((v) => !v)}
            className="hidden rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700 md:block"
            aria-expanded={showLegend}
          >
            Badges
          </button>
          <button
            onClick={share}
            title="Copy a link teammates can open (read-only)"
            className="hidden rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700 md:block"
          >
            {copied ? "Link copied" : "Share"}
          </button>
          <button
            onClick={() => window.print()}
            title="Print the whole conversation, or save it as a PDF"
            className="hidden rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700 md:block"
          >
            Print
          </button>
          <button onClick={newConversation} className="hidden rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700 md:block">
            New chat
          </button>

          {/* Phones and narrow windows: the same controls behind one menu. */}
          <button
            onClick={() => setShowMenu((v) => !v)}
            aria-label="Conversation actions"
            aria-expanded={showMenu}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-zinc-300 text-lg leading-none dark:border-zinc-700 md:hidden"
          >
            ⋯
          </button>
          {showMenu && (
            <>
              <div className="fixed inset-0 z-10 md:hidden" onClick={() => setShowMenu(false)} aria-hidden />
              <div className="absolute right-0 top-11 z-20 w-56 overflow-hidden rounded-lg border border-zinc-200 bg-[var(--background)] py-1 text-sm shadow-lg dark:border-zinc-800 md:hidden">
                <label className="flex cursor-pointer items-center gap-2 px-3 py-2.5 hover:bg-zinc-100 dark:hover:bg-zinc-900">
                  <input type="checkbox" checked={showThoughts} onChange={(e) => setShowThoughts(e.target.checked)} />
                  Show inner thoughts
                </label>
                <MenuButton onClick={() => { setShowMenu(false); setShowLegend(true); }}>What the badges mean</MenuButton>
                <MenuButton onClick={() => { share(); setShowMenu(false); }}>{copied ? "Link copied" : "Copy share link"}</MenuButton>
                <MenuButton onClick={() => { setShowMenu(false); setTimeout(() => window.print(), 50); }}>Print / save as PDF</MenuButton>
                <MenuButton onClick={() => { setShowMenu(false); newConversation(); }}>New chat</MenuButton>
              </div>
            </>
          )}

          {showLegend && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowLegend(false)} aria-hidden />
              <div className="absolute right-0 top-11 z-20 w-[min(18rem,calc(100vw-1rem))] space-y-2 rounded-lg border border-zinc-200 bg-[var(--background)] p-3 text-xs shadow-lg dark:border-zinc-800 md:top-9">
                <div className="flex items-center gap-2"><TierBadge tier="anchor" /> what {name} actually said</div>
                <div className="flex items-center gap-2"><TierBadge tier="company" /> official company material</div>
                <div className="flex items-center gap-2"><TierBadge tier="peer" /> similar people, never their own experience</div>
                <div className="flex items-center gap-2"><TierBadge tier="live" /> looked up online during this chat, verified against the page</div>
                <p className="text-zinc-500">Replies that cite no evidence are flagged as ungrounded. Each conversation starts fresh.</p>
              </div>
            </>
          )}
        </div>
      </header>

      {/* Conversation */}
      <main
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget;
          nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
        }}
        className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain print:block print:overflow-visible"
      >
        <div className="mx-auto w-full max-w-3xl space-y-6 px-3 py-4 sm:px-4 sm:py-6 print:max-w-none print:px-0 print:py-0">
          {/* Printout heading: who, when, and what this is. */}
          <div className="hidden border-b border-zinc-300 pb-3 print:block">
            <div className="text-lg font-semibold">Conversation with {name}</div>
            {icp && <div className="text-sm text-zinc-600">{icp.anchor_role} · {icp.anchor_company}</div>}
            <div className="mt-1 text-xs text-zinc-500">
              {conversation?.createdAt ? `Started ${new Date(conversation.createdAt).toLocaleString()}` : ""}
              {conversation?.createdBy ? ` by ${conversation.createdBy}` : ""}
              {" · "}A simulation built only from public statements, not the real person.
            </div>
          </div>
          {messages.length === 0 && !sending && (
            <div className="flex flex-col items-center pt-6 text-center sm:pt-10 print:hidden">
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

          {sending && <UserMessage content={sending} />}
          {(sending || thinking) && (
            <div className="flex items-center gap-3 text-sm text-zinc-500 print:hidden">
              <Avatar persona={persona.persona} size="sm" />
              <span className="animate-pulse">
                {name} is thinking… (may look things up online)
                {thinking && <span className="block text-xs">You can leave this page or switch apps; the reply will be here when you&apos;re back.</span>}
              </span>
            </div>
          )}
          {conversation?.replyStatus === "failed" && (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-red-300 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:text-red-300 print:hidden">
              <span className="min-w-0 flex-1">No reply: {conversation.replyError ?? "something went wrong."}</span>
              {canWrite && (
                <button onClick={retry} disabled={busy} className="rounded border border-current px-3 py-1.5 disabled:opacity-50">
                  Try again
                </button>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Composer */}
      <footer className="shrink-0 border-t border-zinc-200 pb-[env(safe-area-inset-bottom)] dark:border-zinc-800 print:hidden">
        {!canWrite ? (
          <div className="mx-auto flex w-full max-w-3xl flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
            <span className="text-zinc-500">
              Shared conversation{conversation?.createdBy ? ` started by ${conversation.createdBy}` : ""}
              {conversation?.createdAt ? ` on ${new Date(conversation.createdAt).toLocaleDateString()}` : ""}. Continue it as your own copy;
              theirs stays as it is.
            </span>
            <div className="flex w-full gap-2 sm:w-auto">
              <button
                onClick={newConversation}
                className="flex-1 rounded-lg border border-zinc-300 px-4 py-2 dark:border-zinc-700 sm:flex-none"
              >
                Start fresh
              </button>
              <button
                onClick={continueAsCopy}
                disabled={busy}
                className="flex-1 rounded-lg bg-zinc-900 px-4 py-2 text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 sm:flex-none"
              >
                {busy ? "Copying…" : "Continue it"}
              </button>
            </div>
          </div>
        ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(text);
          }}
          className="mx-auto flex w-full max-w-3xl items-end gap-2 px-3 py-2 sm:px-4 sm:py-3"
        >
          <textarea
            ref={input}
            rows={1}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && finePointer()) {
                e.preventDefault();
                send(text);
              }
            }}
            placeholder={`Message ${name}…`}
            className="max-h-[200px] min-w-0 flex-1 resize-none rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm leading-relaxed dark:border-zinc-700"
          />
          <button
            type="submit"
            disabled={!!sending || thinking || !text.trim()}
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

function MenuButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick} className="block w-full px-3 py-2.5 text-left hover:bg-zinc-100 dark:hover:bg-zinc-900">
      {children}
    </button>
  );
}

function UserMessage({ content }: { content: string }) {
  return (
    <div className="flex justify-end break-inside-avoid">
      <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl bg-zinc-900 px-4 py-2 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900 print:border print:border-zinc-300 print:bg-zinc-100 print:text-zinc-900">
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
    <div className="flex gap-2 sm:gap-3">
      <div className="mt-0.5 print:hidden">
        <Avatar persona={card} size="sm" />
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        <div className="hidden break-after-avoid text-xs font-semibold text-zinc-600 print:block">{card.icp?.anchor_name || card.name}</div>
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
                    className={`-mx-2 break-inside-avoid rounded-md px-2 py-0.5 transition ${
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
              <button onClick={() => setOpen((v) => !v)} className="py-1 underline underline-offset-2 hover:text-zinc-900 dark:hover:text-zinc-100 print:no-underline">
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
                      <a href={l.url} target="_blank" rel="noreferrer noopener" className="underline [overflow-wrap:anywhere]">
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
