"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import { missingAnchor, type Icp } from "@/lib/types";
import type { PersonaData, Source } from "@/lib/client-types";
import { Button, StatusPill, TierBadge } from "@/components/ui";
import { buildIndex, EvidenceToggle } from "@/components/evidence";
import { CompanyLogo, PersonaPhoto } from "@/components/persona-card";
import { Markdown } from "@/components/markdown";
import { soulMarkdown } from "@/lib/soul-format";
import { attachmentHref } from "@/lib/attachment-url";
import { PeopleTab } from "./people-tab";
import { TalkBar, TalkIntro, TalkPrompt } from "./talk-prompt";

const RUNNING = ["discovering", "extracting", "synthesizing"];

export default function PersonaView() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<PersonaData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await api<PersonaData>(`/api/personas/${id}`));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    api<PersonaData>(`/api/personas/${id}`).then(
      (d) => !cancelled && setData(d),
      (e) => !cancelled && setError((e as Error).message),
    );
    return () => {
      cancelled = true;
    };
  }, [id]);

  const status = data?.persona.status;
  const soulWriting = data?.persona.soulStatus === "generating";
  useEffect(() => {
    if (!soulWriting && (!status || !RUNNING.includes(status))) return;
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [status, soulWriting, load]);

  async function act(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function newConversation(question?: string) {
    try {
      const { id: cid } = await api<{ id: string }>(`/api/personas/${id}/conversations`, { method: "POST" });
      router.push(question ? `/chat/${cid}?q=${encodeURIComponent(question)}` : `/chat/${cid}`);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (!data) return <p className="text-sm text-zinc-500">{error ?? "Loading…"}</p>;
  const { persona } = data;
  const ready = persona.version > 0;
  const busy = RUNNING.includes(persona.status);

  const menu: MenuItem[] = [
    ...(ready && data.deepResearchEnabled && !busy ? [{ label: "Update this persona…", onClick: () => setUpdating(true) }] : []),
    ...(ready && !busy && persona.soulStatus !== "generating"
      ? [{ label: data.soul ? "Rewrite soul" : "Write soul", onClick: () => act(() => api(`/api/personas/${id}/soul`, { method: "POST" })) }]
      : []),
    { label: "Activity log", onClick: () => router.push(`/activity?persona=${id}`) },
    {
      label: "Delete persona",
      danger: true,
      onClick: () =>
        confirm(`Delete "${persona.name}" and all its evidence and conversations? This can't be undone.`) &&
        act(async () => {
          await api(`/api/personas/${id}`, { method: "DELETE" });
          router.push("/");
        }),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="pb-3">
        <Link href="/" className="inline-flex items-center gap-1 py-1 pr-2 text-sm text-zinc-500 hover:text-zinc-900 hover:underline dark:hover:text-zinc-100">
          ← All personas
        </Link>
      </div>

      {/* Header: who, and the main action */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-start gap-4 sm:items-center">
        <PersonaPhoto persona={persona} size="lg" className="max-sm:h-14 max-sm:w-14" />
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold leading-tight sm:text-2xl">{persona.icp?.anchor_name ?? persona.name}</h1>
          {persona.icp && (
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-sm text-zinc-500">
              {persona.icp.anchor_role} · <CompanyLogo persona={persona} />
              <span className="text-zinc-800 dark:text-zinc-200">{persona.icp.anchor_company}</span>
            </div>
          )}
          {persona.tagline && <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">{persona.tagline}</p>}
        </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {ready && (
            <button
              onClick={() => newConversation()}
              className="flex-1 rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white transition sm:flex-none hover:scale-[1.02] dark:bg-zinc-100 dark:text-zinc-900"
            >
              New conversation
            </button>
          )}
          <Menu items={menu} />
        </div>
      </div>

      {error && <p className="rounded border border-red-300 p-2 text-sm text-red-700">{error}</p>}
      {persona.queuePosition && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-violet-300 px-3 py-2 text-sm dark:border-violet-900">
          <span className="min-w-0 flex-1">
            Queued for Claude research{persona.queuePosition > 1 ? ` (#${persona.queuePosition} in line)` : " (next up)"}. Research runs one persona
            at a time; this starts automatically.
          </span>
        </div>
      )}
      <StatusBanner data={data} act={act} personaId={id} />
      {ready && persona.soulStatus === "generating" && (
        <div className="flex items-center gap-2 rounded-lg border border-violet-300 px-3 py-2 text-sm dark:border-violet-900">
          <span className="animate-pulse">●</span> Writing their soul… (usually 1–2 minutes)
        </div>
      )}

      {updating && (
        <Builder
          data={data}
          mode="update"
          onChange={load}
          onCancel={() => setUpdating(false)}
          onConfirm={() =>
            act(async () => {
              await api(`/api/personas/${id}/deep-research`, { method: "POST" });
              setUpdating(false);
            })
          }
        />
      )}

      {persona.status === "draft" && (
        <Builder
          data={data}
          onChange={load}
          // Deep research by the Claude routine is the default; the in-app search is a fallback.
          onConfirm={() =>
            act(() => api(`/api/personas/${id}/${data.deepResearchEnabled ? "deep-research" : "research"}`, { method: "POST" }))
          }
        />
      )}

      {ready && !updating && <TalkPrompt data={data} onAsk={newConversation} />}
      {ready && !updating && <Conversations personaId={id} onNew={() => newConversation()} />}
      {ready && !updating && persona.status === "ready" && <TalkIntro data={data} onAsk={() => newConversation()} />}
      {ready && !updating && <TalkBar data={data} onAsk={() => newConversation()} />}

      {ready ? (
        <Tabs data={data} act={act} personaId={id} />
      ) : (
        persona.status !== "draft" && <Sources data={data} act={act} personaId={id} />
      )}
    </div>
  );
}

type MenuItem = { label: string; onClick: () => void; danger?: boolean };

function Menu({ items }: { items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="More actions"
        aria-expanded={open}
        className="flex h-10 w-10 items-center justify-center rounded-full border border-zinc-300 text-lg dark:border-zinc-700"
      >
        ⋯
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute right-0 z-20 mt-2 w-52 overflow-hidden rounded-lg border border-zinc-200 bg-[var(--background)] py-1 shadow-lg dark:border-zinc-800">
            {items.map((it) => (
              <button
                key={it.label}
                onClick={() => {
                  setOpen(false);
                  it.onClick();
                }}
                className={`block w-full px-3 py-2.5 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-900 ${it.danger ? "text-red-600" : ""}`}
              >
                {it.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** Current time, refreshed periodically (keeps render pure). */
function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

/** Minutes without a sign of life before a routine run is considered stalled. */
const START_TIMEOUT_MIN = 10;
const PROGRESS_TIMEOUT_MIN = 45;

/** Only shown when something is in progress or needs attention. */
function StatusBanner({ data, act, personaId }: { data: PersonaData; act: (fn: () => Promise<unknown>) => void; personaId: string }) {
  const { persona, researchRun: run } = data;
  const now = useNow(30_000);
  const busy = RUNNING.includes(persona.status);
  const runActive = !!run && ["requested", "researching"].includes(run.status);
  if (!busy && !runActive && persona.status !== "failed" && persona.status !== "reviewing") return null;

  // We can't ask Anthropic whether a routine session failed, so notice silence instead.
  const minutes = run ? (now - new Date(run.updatedAt).getTime()) / 60000 : 0;
  const stalled =
    runActive && ((run.status === "requested" && minutes > START_TIMEOUT_MIN) || (run.status === "researching" && minutes > PROGRESS_TIMEOUT_MIN));
  const failed = persona.status === "failed" || stalled;
  const tone = failed ? "border-red-300 text-red-800 dark:border-red-900 dark:text-red-300" : "border-violet-300 dark:border-violet-900";
  const message = stalled
    ? run.status === "requested"
      ? `Claude hasn't started this research after ${Math.round(minutes)} minutes. The session probably failed.`
      : `No progress from Claude for ${Math.round(minutes)} minutes. The session may have stopped.`
    : persona.statusDetail;

  return (
    <div className={`flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm ${tone}`}>
      {!stalled && <StatusPill status={persona.status} />}
      {busy && !stalled && <span className="animate-pulse">●</span>}
      <span className="min-w-0 flex-1">{message}</span>
      {run?.sessionUrl && (runActive || failed) && (
        <a href={run.sessionUrl} target="_blank" rel="noreferrer noopener" className="underline">
          {stalled ? "Check Claude's session" : "Watch Claude's session"}
        </a>
      )}
      {(stalled || (runActive && busy)) && (
        <>
          {stalled && data.deepResearchEnabled && (
            <Button
              onClick={() =>
                act(async () => {
                  await api(`/api/personas/${personaId}/deep-research/cancel`, { method: "POST" });
                  await api(`/api/personas/${personaId}/deep-research`, { method: "POST" });
                })
              }
            >
              Retry
            </Button>
          )}
          <Button
            variant="secondary"
            onClick={() =>
              confirm("Cancel this research run?") && act(() => api(`/api/personas/${personaId}/deep-research/cancel`, { method: "POST" }))
            }
          >
            Cancel
          </Button>
        </>
      )}
    </div>
  );
}

type ConversationRow = {
  id: string; title: string | null; createdBy: string | null; createdAt: string;
  messageCount: number; lastAt: string | null; snippet: string | null;
};

function timeAgo(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}

/** Every teammate's conversations with this persona, searchable by title, author and content. */
function Conversations({ personaId, onNew }: { personaId: string; onNew: () => void }) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<ConversationRow[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => {
      api<{ conversations: ConversationRow[] }>(`/api/personas/${personaId}/conversations?q=${encodeURIComponent(q)}`).then(
        (d) => !cancelled && setRows(d.conversations),
        () => !cancelled && setRows([]),
      );
    }, q ? 250 : 0);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [personaId, q]);

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Conversations</h2>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search conversations…"
          className="w-full rounded-full border sm:max-w-xs border-zinc-300 bg-transparent px-4 py-1.5 text-sm dark:border-zinc-700"
        />
      </div>
      {rows === null ? (
        <p className="text-sm text-zinc-500">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700">
          {q ? (
            "No conversations match."
          ) : (
            <>
              No conversations yet.{" "}
              <button onClick={onNew} className="underline">Start the first one</button>.
            </>
          )}
        </div>
      ) : (
        <ul className="divide-y divide-zinc-200 overflow-hidden rounded-xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {rows.map((c) => (
            <li key={c.id}>
              <Link href={`/chat/${c.id}`} className="block px-4 py-3 transition hover:bg-zinc-50 dark:hover:bg-zinc-900">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="truncate font-medium">{c.title ?? "Untitled conversation"}</span>
                  <span className="shrink-0 text-xs text-zinc-500">{timeAgo(c.lastAt ?? c.createdAt)}</span>
                </div>
                {c.snippet && <p className="mt-0.5 line-clamp-1 text-sm text-zinc-500">{c.snippet.replace(/[#*|>_`]/g, "")}</p>}
                <div className="mt-1 text-xs text-zinc-500">
                  {c.createdBy ?? "unknown"} · {c.messageCount} messages
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const TABS = ["Soul", "About", "Research questions", "People to talk to", "Profile", "Gaps", "Sources", "Setup"] as const;

function Tabs({ data, act, personaId }: { data: PersonaData; act: (fn: () => Promise<unknown>) => void; personaId: string }) {
  const [tab, setTab] = useState<(typeof TABS)[number]>(data.soul ? "Soul" : "About");
  const idx = useMemo(() => buildIndex(data), [data]);
  return (
    <section>
      <div className="mb-4 flex gap-1 overflow-x-auto border-b border-zinc-200 dark:border-zinc-800">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm ${
              tab === t ? "border-zinc-900 font-medium dark:border-zinc-100" : "border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
            }`}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === "Soul" && <SoulView data={data} act={act} personaId={personaId} />}
      {tab === "About" && (
        <div className="space-y-3">
          {data.persona.summary ? <p className="leading-relaxed">{data.persona.summary}</p> : <p className="text-zinc-500">No description yet.</p>}
          <EvidenceToggle insightIds={data.persona.summaryInsightIds} storyIds={data.persona.summaryStoryIds} idx={idx} />
          <p className="text-xs text-zinc-500">
            Built from {data.subjects.length} verified sources · {data.insights.length} quotes · {data.stories.length} stories ·
            version {data.persona.version}
          </p>
        </div>
      )}
      {tab === "Research questions" && <Answers data={data} />}
      {tab === "People to talk to" && <PeopleTab data={data} />}
      {tab === "Profile" && <ProfileElements data={data} />}
      {tab === "Gaps" && <GapsView data={data} act={act} personaId={personaId} />}
      {tab === "Sources" && <Sources data={data} act={act} personaId={personaId} />}
      {tab === "Setup" && data.persona.icp && <IcpCard icp={data.persona.icp} />}
    </section>
  );
}

function Builder({
  data,
  onChange,
  onConfirm,
  onCancel,
  mode = "create",
}: {
  data: PersonaData;
  onChange: () => Promise<void>;
  onConfirm: () => void;
  onCancel?: () => void;
  mode?: "create" | "update";
}) {
  const [text, setText] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isUpdate = mode === "update";
  const icp = isUpdate ? data.persona.pendingIcp : data.persona.icp;
  const [files, setFiles] = useState<{ id: string; filename: string; url: string }[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  const textBox = useRef<HTMLTextAreaElement>(null);
  // Grow the box with its content, up to a limit.
  useEffect(() => {
    const el = textBox.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [text]);
  const personaId = data.persona.id;

  useEffect(() => {
    let cancelled = false;
    api<{ files: { id: string; filename: string; url: string }[] }>(`/api/personas/${personaId}/attachments`).then(
      (d) => !cancelled && setFiles(d.files),
      () => {},
    );
    return () => {
      cancelled = true;
    };
  }, [personaId]);

  async function upload(file: File) {
    if (pending) return;
    setError(null);
    setPending(`📎 ${file.name}`);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/personas/${personaId}/attachments`, { method: "POST", body: form });
      const body = (await res.json().catch(() => ({}))) as { error?: string; file?: { id: string; filename: string; url: string } };
      if (!res.ok || !body.file) throw new Error(body.error ?? `Upload failed (${res.status})`);
      setFiles((f) => [...f, body.file!]);
      // Tell the builder, so it reads the file and continues from it.
      await api(`/api/personas/${personaId}/builder`, { body: { text: `I uploaded "${body.file.filename}".` } });
      await onChange();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPending(null);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || pending) return;
    const msg = text.trim();
    setPending(msg);
    setText("");
    setError(null);
    try {
      await api(`/api/personas/${data.persona.id}/builder`, { body: { text: msg } });
      await onChange();
    } catch (err) {
      setError((err as Error).message);
      setText(msg);
    } finally {
      setPending(null);
    }
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{isUpdate ? "Update this persona" : "Who do you want to talk to?"}</h2>
        {onCancel && <Button variant="secondary" onClick={onCancel}>Cancel</Button>}
      </div>
      <div className="space-y-3">
        <Bubble role="assistant">
          {isUpdate
            ? "What should the next research run change or add? For example new research questions, newer material (latest results, recent interviews), a topic to dig into, or a different peer group."
            : "Tell me which real person you want to simulate, e.g. “the CMO of Unilever”, or a name and company. I'll confirm who they are, then we'll decide which peers to learn from and what the persona needs to know."}
        </Bubble>
        {data.builder.map((m, i) => (
          <div key={i} className="space-y-2">
            {m.content && <Bubble role={m.role}>{m.role === "assistant" ? <Markdown>{m.content}</Markdown> : m.content}</Bubble>}
            {m.icp && i === data.builder.length - 1 && (!isUpdate || data.persona.pendingIcp) && <IcpCard icp={m.icp} />}
          </div>
        ))}
        {pending && <Bubble role="user">{pending}</Bubble>}
        {pending && <p className="animate-pulse text-sm text-zinc-500">Thinking (may search the web or read pages)…</p>}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {files.length > 0 && (
        <div className="flex flex-wrap gap-2 text-xs">
          {files.map((f) => (
            <a
              key={f.id}
              href={attachmentHref(f.url)}
              target="_blank"
              rel="noreferrer noopener"
              className="rounded-full border border-zinc-300 px-2 py-1 text-zinc-600 hover:text-zinc-900 dark:border-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              📎 {f.filename}
            </a>
          ))}
        </div>
      )}
      <form onSubmit={send} className="flex items-end gap-2">
        <input
          ref={fileInput}
          type="file"
          accept="application/pdf,.pdf,text/plain,.txt,.md"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) upload(f);
          }}
        />
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          disabled={!!pending}
          title="Upload a PDF, e.g. their LinkedIn profile (More → Save to PDF)"
          aria-label="Upload a file"
          className="h-10 shrink-0 rounded border border-zinc-300 px-3 text-base disabled:opacity-50 dark:border-zinc-700"
        >
          📎
        </button>
        <textarea
          ref={textBox}
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            // Enter sends; Shift+Enter starts a new line. On phones (no Shift key) Enter adds a line
            // and the Send button sends.
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && window.matchMedia("(pointer: fine)").matches) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
          placeholder="Type your answer… (Shift+Enter for a new line)"
          className="max-h-[200px] min-w-0 flex-1 resize-none rounded border border-zinc-300 bg-transparent px-3 py-2 text-sm leading-relaxed dark:border-zinc-700"
        />
        <Button type="submit" disabled={!!pending}>Send</Button>
      </form>
      {icp && missingAnchor(icp).length > 0 && (
        <p className="rounded border border-amber-300 p-3 text-sm text-amber-800 dark:border-amber-900 dark:text-amber-300">
          Research needs one real, named person to simulate (missing: {missingAnchor(icp).join(", ")}). Tell me who, or ask me to
          suggest a few people who fit.
        </p>
      )}
      {icp && missingAnchor(icp).length === 0 && (
        <div className="flex flex-col gap-3 rounded border border-emerald-300 p-3 dark:border-emerald-900 sm:flex-row sm:items-center">
          <p className="flex-1 text-sm">
            Happy with the setup above?{" "}
            {isUpdate
              ? "Claude will research what's new and what you asked for, then the persona is rebuilt as a new version. Existing chats keep their version."
              : data.deepResearchEnabled
              ? "Claude will research them exhaustively: their own interviews and writing, company material and peers. It can take a while; you can leave this page."
              : "Next, I'll search for their interviews, company material and peers."}
          </p>
          <Button onClick={onConfirm} disabled={!!pending || (isUpdate && !data.deepResearchEnabled)}>
            {isUpdate ? "Confirm & update with Claude" : data.deepResearchEnabled ? "Confirm & research with Claude" : "Confirm & find sources"}
          </Button>
        </div>
      )}
    </section>
  );
}

function Bubble({ role, children }: { role: "user" | "assistant"; children: React.ReactNode }) {
  return (
    <div className={`flex ${role === "user" ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${role === "user" ? "whitespace-pre-wrap " : ""}${
          role === "user" ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "bg-zinc-100 dark:bg-zinc-900"
        }`}
      >
        {children}
      </div>
    </div>
  );
}

function IcpCard({ icp }: { icp: Icp }) {
  return (
    <div className="rounded-lg border border-zinc-200 p-4 text-sm dark:border-zinc-800">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <div className="text-xs uppercase tracking-wide text-zinc-500">Simulating</div>
          <div className="text-base font-semibold">{icp.anchor_name}</div>
          <div className="text-zinc-600 dark:text-zinc-400">{icp.anchor_role} at {icp.anchor_company}</div>
        </div>
        {icp.anchor_linkedin_url ? (
          <a href={icp.anchor_linkedin_url} target="_blank" rel="noreferrer noopener" className="text-sm underline">
            LinkedIn profile ↗
          </a>
        ) : (
          <span className="text-xs text-amber-700">No LinkedIn profile found yet</span>
        )}
      </div>
      {icp.identity_evidence.length > 0 && (
        <div className="mt-2 text-xs text-zinc-500">
          Identity confirmed by:{" "}
          {icp.identity_evidence.map((u, i) => (
            <a key={u} href={u} target="_blank" rel="noreferrer noopener" className="underline">
              {i > 0 && ", "}
              {safeHost(u)}
            </a>
          ))}
        </div>
      )}
      <dl className="mt-3 grid gap-2 sm:grid-cols-2">
        <Field label="Peers" value={`${icp.peer_role} · ${icp.peer_seniority} · ${icp.peer_company_profile}`} />
        <Field label="Peer industries / regions" value={[...icp.peer_industries, ...icp.peer_regions].join(", ")} />
      </dl>
      <List label="Research questions" items={icp.research_questions} />
      <List label="What you want to learn" items={icp.learning_goals} />
      {icp.exclusions.length > 0 && <List label="Exclusions" items={icp.exclusions} />}
    </div>
  );
}

function safeHost(u: string) {
  try {
    return new URL(u).hostname;
  } catch {
    return u;
  }
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-zinc-500">{label}</dt>
      <dd>{value || "—"}</dd>
    </div>
  );
}

function List({ label, items }: { label: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div className="mt-3">
      <div className="text-xs uppercase tracking-wide text-zinc-500">{label}</div>
      <ul className="ml-4 list-disc">
        {items.map((x) => <li key={x}>{x}</li>)}
      </ul>
    </div>
  );
}

const ANSWER_STYLE: Record<string, { label: string; cls: string }> = {
  answered: { label: "Answered", cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" },
  partial: { label: "Partial", cls: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" },
  unknown: { label: "Unknown", cls: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300" },
};

const CATEGORY_LABEL: Record<string, string> = {
  opinion: "Opinions", belief: "Beliefs", budget: "Budget", responsibility: "Responsibilities", trait: "Traits",
  goal: "Goals", pain_point: "Pain points", decision_process: "How they decide", objection: "Objections",
  language: "How they talk", history: "History",
};

/** One collapsible card per research question: the question and its status first, the answer on demand. */
function Answers({ data }: { data: PersonaData }) {
  const idx = useMemo(() => buildIndex(data), [data]);
  // null: each card's own state; true/false: everything expanded or collapsed.
  const [all, setAll] = useState<boolean | null>(null);
  if (!data.answers.length) return <p className="text-sm text-zinc-500">No research questions.</p>;
  const counts = data.answers.reduce<Record<string, number>>((m, a) => ((m[a.status] = (m[a.status] ?? 0) + 1), m), {});
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
        <span>{data.answers.length} questions:</span>
        {(["answered", "partial", "unknown"] as const).map((st) =>
          counts[st] ? (
            <span key={st} className={`rounded-full px-2 py-0.5 text-xs font-medium ${ANSWER_STYLE[st].cls}`}>
              {counts[st]} {ANSWER_STYLE[st].label.toLowerCase()}
            </span>
          ) : null,
        )}
        <button onClick={() => setAll(all ? false : true)} className="ml-auto text-xs underline underline-offset-2">
          {all ? "Collapse all" : "Expand all"}
        </button>
      </div>
      <ul className="space-y-2">
        {data.answers.map((a) => {
          const st = ANSWER_STYLE[a.status] ?? ANSWER_STYLE.unknown;
          return (
            <li key={`${a.id}-${all}`} className="rounded-xl border border-zinc-200 dark:border-zinc-800">
              <details open={all ?? false} className="group">
                <summary className="flex cursor-pointer list-none items-start gap-3 p-4">
                  <span aria-hidden className="mt-0.5 text-zinc-400 transition group-open:rotate-90">▶</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-base font-semibold leading-snug">{a.question}</span>
                    {a.answer && (
                      <span className="mt-1 line-clamp-2 text-sm leading-6 text-zinc-600 group-open:hidden dark:text-zinc-400">{a.answer}</span>
                    )}
                  </span>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${st.cls}`}>{st.label}</span>
                </summary>
                <div className="space-y-3 px-4 pb-4 sm:pl-11">
                  <p className="max-w-prose text-[15px] leading-7 text-zinc-800 dark:text-zinc-200">
                    {a.answer ?? "Not found in any public source. The persona will say so rather than guess."}
                  </p>
                  {a.basis && (
                    <div className="flex items-center gap-2 text-xs text-zinc-500">
                      Based on <TierBadge tier={a.basis} />
                    </div>
                  )}
                  <EvidenceToggle insightIds={a.insightIds} storyIds={a.storyIds} idx={idx} />
                </div>
              </details>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ProfileElements({ data }: { data: PersonaData }) {
  const idx = useMemo(() => buildIndex(data), [data]);
  const groups = useMemo(() => {
    const m = new Map<string, typeof data.elements>();
    for (const e of data.elements) m.set(e.category, [...(m.get(e.category) ?? []), e]);
    return [...m].sort((a, b) => Object.keys(CATEGORY_LABEL).indexOf(a[0]) - Object.keys(CATEGORY_LABEL).indexOf(b[0]));
  }, [data]);
  return (
    <div className="space-y-5">
      {groups.map(([cat, els]) => (
        <div key={cat}>
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500">{CATEGORY_LABEL[cat] ?? cat}</h3>
          <ul className="space-y-2">
            {els.map((e) => (
              <li key={e.id} className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
                <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
                  {e.title} <TierBadge tier={e.basis} />
                </div>
                <p className="mt-1 text-sm">{e.description}</p>
                {e.disagreement && <p className="mt-1 text-sm text-amber-700 dark:text-amber-400">Disagreement: {e.disagreement}</p>}
                <EvidenceToggle insightIds={e.insightIds} storyIds={e.storyIds} idx={idx} />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

const SOURCE_STATUS: Record<string, string> = {
  candidate: "Not reviewed", approved: "Approved", rejected: "Rejected", fetch_failed: "Couldn't read page",
  extracted: "Verified", no_evidence: "No usable evidence",
};

function Sources({ data, act, personaId }: { data: PersonaData; act: (fn: () => Promise<unknown>) => void; personaId: string }) {
  const [url, setUrl] = useState("");
  const [tier, setTier] = useState("anchor");
  const editable = ["reviewing", "ready", "failed"].includes(data.persona.status);
  const approved = data.sources.filter((s) => s.status === "approved").length;
  const tiers: [string, string][] = [
    ["anchor", `By or with ${data.persona.icp?.anchor_name ?? "the person"}`],
    ["company", `${data.persona.icp?.anchor_company ?? "Company"} material`],
    ["peer", "Similar people (peers)"],
  ];

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Sources</h2>
        {editable && (
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={() => act(() => api(`/api/personas/${personaId}/research`, { method: "POST" }))}>
              Search again
            </Button>
            <Button disabled={!approved} onClick={() => act(() => api(`/api/personas/${personaId}/extract`, { method: "POST" }))}>
              Verify {approved} approved & build persona
            </Button>
          </div>
        )}
      </div>
      {data.persona.status === "reviewing" && (
        <p className="text-sm text-zinc-500">
          Approve the sources that are really about the right people. Every quote will then be checked word for word against the page.
        </p>
      )}
      {editable && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            act(async () => {
              await api(`/api/personas/${personaId}/sources`, { body: { url, tier } });
              setUrl("");
            });
          }}
          className="flex flex-wrap gap-2 sm:flex-nowrap"
        >
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Add a URL (podcast transcript, interview, article, filing…)"
            className="min-w-0 flex-1 basis-full rounded border border-zinc-300 bg-transparent px-3 py-1.5 text-sm dark:border-zinc-700"
          />
          <select value={tier} onChange={(e) => setTier(e.target.value)} className="min-w-0 flex-1 rounded border py-1.5 sm:flex-none border-zinc-300 bg-transparent px-2 text-sm dark:border-zinc-700">
            {tiers.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <Button type="submit" variant="secondary" disabled={!url}>Add</Button>
        </form>
      )}
      {tiers.map(([t, label]) => {
        const rows = data.sources.filter((s) => s.tier === t);
        return (
          <div key={t}>
            <h3 className="mb-2 flex items-center gap-2 text-sm font-medium">
              <TierBadge tier={t} /> {label} <span className="text-zinc-500">({rows.length})</span>
            </h3>
            {rows.length === 0 && <p className="text-sm text-zinc-500">None yet.</p>}
            <ul className="space-y-2">
              {rows.map((s) => <SourceRow key={s.id} s={s} act={act} editable={editable} />)}
            </ul>
          </div>
        );
      })}
    </section>
  );
}

function SourceRow({ s, act, editable }: { s: Source; act: (fn: () => Promise<unknown>) => void; editable: boolean }) {
  const reviewable = editable && ["candidate", "approved", "rejected"].includes(s.status);
  const set = (status: string) => act(() => api(`/api/sources/${s.id}`, { method: "PATCH", body: { status } }));
  return (
    <li className={`rounded border p-3 text-sm dark:border-zinc-800 ${s.status === "rejected" ? "opacity-50" : "border-zinc-200"}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <a href={attachmentHref(s.url)} target="_blank" rel="noreferrer noopener" className="font-medium underline [overflow-wrap:anywhere]">
            {s.title ?? s.url}
          </a>
          <div className="text-xs text-zinc-500">
            {[s.claimedSubjectName, s.claimedSubjectRole, s.publisher, s.publishedAt].filter(Boolean).join(" · ")}
            {s.fitScore ? ` · fit ${s.fitScore}/5` : ""}
          </div>
          {s.fitReason && <div className="mt-1 text-xs">{s.fitReason}</div>}
          {s.error && <div className="mt-1 text-xs text-red-600">{s.error}</div>}
          {s.status === "extracted" && (
            <div className="mt-1 text-xs text-emerald-700 dark:text-emerald-400">
              {s.acceptedCount} verified items{s.rejectedCount ? `, ${s.rejectedCount} discarded` : ""}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 max-sm:w-full max-sm:justify-end">
          <span className="text-xs text-zinc-500 max-sm:mr-auto">{SOURCE_STATUS[s.status] ?? s.status}</span>
          {reviewable && (
            <>
              <Button variant={s.status === "approved" ? "primary" : "secondary"} onClick={() => set("approved")}>✓</Button>
              <Button variant={s.status === "rejected" ? "danger" : "secondary"} onClick={() => set("rejected")}>✕</Button>
            </>
          )}
        </div>
      </div>
    </li>
  );
}

/** The persona's SOUL.md: identity sections, a character sheet, and a download. */
function SoulView({ data, act, personaId }: { data: PersonaData; act: (fn: () => Promise<unknown>) => void; personaId: string }) {
  const idx = useMemo(() => buildIndex(data), [data]);
  const soul = data.soul;
  const { soulStatus, soulError } = data.persona;
  const write = () => act(() => api(`/api/personas/${personaId}/soul`, { method: "POST" }));
  if (soulStatus === "generating") {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-violet-300 p-4 text-sm dark:border-violet-900">
        <span className="animate-pulse">●</span>
        <div>
          <div className="font-medium">Writing their soul…</div>
          <div className="text-zinc-500">
            Reading everything they&apos;ve said and turning it into who they are. This usually takes 1–2 minutes; the page updates by itself.
          </div>
        </div>
      </div>
    );
  }
  if (!soul) {
    return (
      <div className={`flex flex-wrap items-center gap-3 rounded-lg border p-4 text-sm ${soulStatus === "failed" ? "border-red-300 dark:border-red-900" : "border-zinc-200 dark:border-zinc-800"}`}>
        <div className="min-w-0 flex-1">
          <div className="font-medium">{soulStatus === "failed" ? "The soul couldn't be written" : "No soul yet"}</div>
          <div className="text-zinc-500">
            {soulError ??
              "The soul (their identity, beliefs, values, voice and tensions) is written from their own verified words after research."}
          </div>
        </div>
        <Button onClick={write}>{soulStatus === "failed" ? "Try again" : "Write soul"}</Button>
      </div>
    );
  }
  const name = data.persona.icp?.anchor_name ?? data.persona.name;
  const download = () => {
    const md = soulMarkdown(name, soul, (id) => {
      const q = idx.insights.get(id) ?? idx.stories.get(id);
      if (!q) return undefined;
      const subject = idx.subjects.get(q.subjectId);
      return { quote: q.quote, who: subject?.name ?? "", url: idx.sources.get(q.sourceId)?.url ?? "" };
    });
    const url = URL.createObjectURL(new Blob([md], { type: "text/markdown" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `SOUL-${name.replace(/\s+/g, "-")}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const { phrases, scales, lightsUpOn, deflects } = soul.sheet;
  return (
    // minmax(0, …): Safari otherwise widens the column to fit a table or code block in the text.
    <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_280px]">
      <div className="min-w-0 space-y-6">
        <p className="text-xs text-zinc-500">
          Written in their voice, only from their own words and their company&apos;s material. Every section cites its quotes.
        </p>
        {soul.sections.map((sec) => (
          <section key={sec.key}>
            <h3 className="mb-1 font-semibold">{sec.title}</h3>
            <div className="text-[15px] leading-relaxed">
              <Markdown>{sec.body}</Markdown>
            </div>
            <EvidenceToggle insightIds={sec.insightIds} storyIds={sec.storyIds} idx={idx} />
          </section>
        ))}
      </div>
      <aside className="min-w-0 space-y-6 lg:sticky lg:top-4 lg:self-start">
        <Button variant="secondary" onClick={download}>Download SOUL.md</Button>
        <div>
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500">Temperament</h3>
          <ul className="space-y-3">
            {scales.map((sc) => (
              <li key={sc.key} className="text-xs">
                <div className="mb-1 flex justify-between text-zinc-500">
                  <span>{sc.left}</span>
                  <span>{sc.right}</span>
                </div>
                {sc.value ? (
                  <div className="relative h-1.5 rounded-full bg-zinc-200 dark:bg-zinc-800">
                    <div
                      className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-zinc-900 dark:bg-zinc-100"
                      style={{ left: `${((sc.value - 1) / 4) * 100}%` }}
                      title={`${sc.value}/5`}
                    />
                  </div>
                ) : (
                  <div className="text-zinc-400">Not enough evidence</div>
                )}
              </li>
            ))}
          </ul>
        </div>
        {phrases.length > 0 && (
          <div>
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500">Things they say</h3>
            <ul className="space-y-1.5 text-sm italic">
              {phrases.map((p) => <li key={p.phrase}>“{p.phrase}”</li>)}
            </ul>
          </div>
        )}
        {lightsUpOn.length > 0 && (
          <div>
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500">Lights up on</h3>
            <div className="flex flex-wrap gap-1.5">
              {lightsUpOn.map((t) => (
                <span key={t.topic} className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs">{t.topic}</span>
              ))}
            </div>
          </div>
        )}
        {deflects.length > 0 && (
          <div>
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500">Deflects</h3>
            <div className="flex flex-wrap gap-1.5">
              {deflects.map((t) => (
                <span key={t.topic} className="rounded-full bg-zinc-500/15 px-2 py-0.5 text-xs">{t.topic}</span>
              ))}
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}

type Gap = {
  id: string; question: string; note: string | null; askedBy: string | null; liveTried: boolean;
  status: string; createdAt: string; conversationId: string | null;
};

/** What conversations couldn't answer from evidence, and one click to research it. */
function GapsView({ data, act, personaId }: { data: PersonaData; act: (fn: () => Promise<unknown>) => void; personaId: string }) {
  const [gaps, setGaps] = useState<Gap[] | null>(null);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let cancelled = false;
    api<{ gaps: Gap[] }>(`/api/personas/${personaId}/gaps`).then(
      (d) => !cancelled && setGaps(d.gaps),
      () => !cancelled && setGaps([]),
    );
    return () => {
      cancelled = true;
    };
  }, [personaId, reload, data.persona.status]);
  if (!gaps) return <p className="text-sm text-zinc-500">Loading…</p>;
  const open = gaps.filter((g) => g.status === "open");
  const busy = RUNNING.includes(data.persona.status);
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-3 text-sm dark:border-zinc-800 sm:flex-row sm:items-center">
        <p className="min-w-0 flex-1 text-zinc-600 dark:text-zinc-400">
          Questions from your team&apos;s conversations that the evidence didn&apos;t cover. Send them to Claude to look for public material;
          anything found is verified and becomes a new version of the persona.
        </p>
        {data.deepResearchEnabled && (
          <Button
            disabled={!open.length || busy}
            onClick={() =>
              act(async () => {
                await api(`/api/personas/${personaId}/gaps/research`, { method: "POST" });
                setReload((n) => n + 1);
              })
            }
          >
            Research {open.length || ""} open {open.length === 1 ? "gap" : "gaps"} with Claude
          </Button>
        )}
      </div>
      {gaps.length === 0 ? (
        <p className="text-sm text-zinc-500">No gaps yet. They appear when a conversation asks something the evidence doesn&apos;t cover.</p>
      ) : (
        <ul className="divide-y divide-zinc-200 overflow-hidden rounded-xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {gaps.map((g) => (
            <li key={g.id} className="px-4 py-3 text-sm">
              <div className="flex items-start justify-between gap-3">
                <span className="min-w-0 font-medium [overflow-wrap:anywhere]">{g.question}</span>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${
                    g.status === "open"
                      ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                      : g.status === "researching"
                        ? "bg-violet-500/15 text-violet-700 dark:text-violet-300"
                        : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                  }`}
                >
                  {g.status}
                </span>
              </div>
              <div className="mt-1 text-xs text-zinc-500">
                {g.askedBy ?? "someone"} · {timeAgo(g.createdAt)} · {g.liveTried ? "live lookup tried, nothing usable" : "no live lookup"}
                {g.conversationId && (
                  <>
                    {" · "}
                    <Link href={`/chat/${g.conversationId}`} className="underline">conversation</Link>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
