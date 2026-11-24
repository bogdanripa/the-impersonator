"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api-client";
import type { PersonaData } from "@/lib/client-types";
import { buildIndex, EvidenceList, subjectTier, type EvidenceIndex } from "@/components/evidence";
import { Button, TierBadge } from "@/components/ui";

type Message = {
  id: string; role: string; content: string; innerThought: string | null;
  insightIds: string[]; storyIds: string[]; ungrounded: boolean; createdAt: string;
};
type Conversation = { id: string; personaId: string; personaVersion: number; title: string | null };

export default function ChatView() {
  const { id } = useParams<{ id: string }>();
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [persona, setPersona] = useState<PersonaData | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showThoughts, setShowThoughts] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      try {
        const c = await api<{ conversation: Conversation; messages: Message[] }>(`/api/conversations/${id}`);
        setConversation(c.conversation);
        setMessages(c.messages);
        setPersona(await api<PersonaData>(`/api/personas/${c.conversation.personaId}`));
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, [id]);

  useEffect(() => bottom.current?.scrollIntoView({ behavior: "smooth" }), [messages, pending]);

  const idx = useMemo(() => (persona ? buildIndex(persona) : null), [persona]);
  const icp = persona?.persona.icp;

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || pending) return;
    const msg = text.trim();
    setText("");
    setPending(msg);
    setError(null);
    try {
      const r = await api<{ user: Message; persona: Message }>(`/api/conversations/${id}/messages`, { body: { text: msg } });
      setMessages((m) => [...m, r.user, r.persona]);
    } catch (err) {
      setError((err as Error).message);
      setText(msg);
    } finally {
      setPending(null);
    }
  }

  if (!persona || !idx) return <p className="text-sm text-zinc-500">{error ?? "Loading…"}</p>;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <Link href={`/personas/${persona.persona.id}`} className="text-xs text-zinc-500 underline">← Persona profile</Link>
          <h1 className="text-xl font-semibold">{icp?.anchor_name ?? persona.persona.name}</h1>
          <p className="text-sm text-zinc-500">
            {icp ? `${icp.anchor_role} at ${icp.anchor_company} · ` : ""}Simulation built only from public statements
            {conversation && conversation.personaVersion !== persona.persona.version && " · uses an earlier version of the persona"}
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={showThoughts} onChange={(e) => setShowThoughts(e.target.checked)} />
          Show inner thoughts & evidence
        </label>
      </div>

      <div className="flex flex-wrap gap-3 text-xs text-zinc-500">
        <span className="flex items-center gap-1"><TierBadge tier="anchor" /> what they said</span>
        <span className="flex items-center gap-1"><TierBadge tier="company" /> official company material</span>
        <span className="flex items-center gap-1"><TierBadge tier="peer" /> similar people, never their own experience</span>
      </div>

      <div className="space-y-4">
        {messages.length === 0 && !pending && (
          <p className="rounded border border-dashed border-zinc-300 p-4 text-sm text-zinc-500 dark:border-zinc-700">
            This conversation starts fresh. Ask about their priorities, budget, team, how they buy, or how AI is changing their world.
          </p>
        )}
        {messages.map((m) =>
          m.role === "user" ? (
            <div key={m.id} className="flex justify-end">
              <div className="max-w-[85%] whitespace-pre-wrap rounded-lg bg-zinc-900 px-3 py-2 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900">
                {m.content}
              </div>
            </div>
          ) : (
            <PersonaMessage key={m.id} m={m} idx={idx} showThoughts={showThoughts} />
          ),
        )}
        {pending && (
          <>
            <div className="flex justify-end">
              <div className="max-w-[85%] whitespace-pre-wrap rounded-lg bg-zinc-900 px-3 py-2 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900">
                {pending}
              </div>
            </div>
            <p className="animate-pulse text-sm text-zinc-500">{icp?.anchor_name ?? "The persona"} is thinking…</p>
          </>
        )}
        <div ref={bottom} />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      <form onSubmit={send} className="sticky bottom-0 flex gap-2 bg-[var(--background)] py-3">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={`Ask ${icp?.anchor_name ?? "them"} something…`}
          className="flex-1 rounded border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
        />
        <Button type="submit" disabled={!!pending}>Send</Button>
      </form>
    </div>
  );
}

function PersonaMessage({ m, idx, showThoughts }: { m: Message; idx: EvidenceIndex; showThoughts: boolean }) {
  const tiers = new Set(
    [...m.insightIds.map((i) => idx.insights.get(i)?.subjectId), ...m.storyIds.map((s) => idx.stories.get(s)?.subjectId)]
      .filter((x): x is string => !!x)
      .map((sid) => subjectTier(idx.subjects.get(sid))),
  );
  const n = m.insightIds.length + m.storyIds.length;
  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] space-y-2">
        <div className="whitespace-pre-wrap rounded-lg bg-zinc-100 px-3 py-2 text-sm dark:bg-zinc-900">{m.content}</div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
          {m.ungrounded ? (
            <span className="rounded bg-red-100 px-1.5 py-0.5 font-medium text-red-700 dark:bg-red-950 dark:text-red-300">
              ⚠ Ungrounded: cites no evidence. Don&apos;t treat as fact.
            </span>
          ) : n === 0 ? (
            <span>No evidence on this topic. The persona said so.</span>
          ) : (
            <>
              <span>Grounded in {n} {n === 1 ? "quote" : "quotes"}</span>
              {[...tiers].map((t) => <TierBadge key={t} tier={t} />)}
            </>
          )}
        </div>
        {showThoughts && (
          <div className="rounded border border-dashed border-zinc-300 p-2 text-sm dark:border-zinc-700">
            {m.innerThought && (
              <p className="italic text-zinc-600 dark:text-zinc-400">
                <span className="not-italic font-medium">Inner thought: </span>
                {m.innerThought}
              </p>
            )}
            <EvidenceList insightIds={m.insightIds} storyIds={m.storyIds} idx={idx} />
          </div>
        )}
      </div>
    </div>
  );
}
