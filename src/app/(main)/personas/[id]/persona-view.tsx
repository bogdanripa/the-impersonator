"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import type { Icp } from "@/lib/types";
import type { PersonaData, Source } from "@/lib/client-types";
import { Button, StatusPill, TierBadge } from "@/components/ui";
import { buildIndex, EvidenceToggle } from "@/components/evidence";
import { PersonaCard } from "@/components/persona-card";
import { Markdown } from "@/components/markdown";

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
  useEffect(() => {
    if (!status || !RUNNING.includes(status)) return;
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [status, load]);

  async function act(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (!data) return <p className="text-sm text-zinc-500">{error ?? "Loading…"}</p>;
  const { persona } = data;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/" className="text-xs text-zinc-500 underline">← All personas</Link>
          {persona.icp ? (
            <div className="mt-2">
              <PersonaCard
                persona={persona}
                footer={
                  <EvidenceToggle
                    insightIds={persona.summaryInsightIds}
                    storyIds={persona.summaryStoryIds}
                    idx={buildIndex(data)}
                    label="Show"
                  />
                }
              />
            </div>
          ) : (
            <h1 className="mt-1 text-2xl font-semibold">{persona.name}</h1>
          )}
          <div className="mt-2 flex items-center gap-2 text-sm text-zinc-500">
            <StatusPill status={persona.status} />
            {RUNNING.includes(persona.status) && <span className="animate-pulse">●</span>}
            <span>{persona.statusDetail}</span>
          </div>
        </div>
        <Button
          variant="danger"
          onClick={() =>
            confirm(`Delete "${persona.name}" and all its evidence and conversations? This can't be undone.`) &&
            act(async () => {
              await api(`/api/personas/${id}`, { method: "DELETE" });
              router.push("/");
            })
          }
        >
          Delete
        </Button>
      </div>

      {error && <p className="rounded border border-red-300 p-2 text-sm text-red-700">{error}</p>}

      {persona.status !== "draft" && !updating && (
        <DeepResearch data={data} onStart={() => setUpdating(true)} />
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

      {persona.status === "draft" ? (
        <Builder
          data={data}
          onChange={load}
          // Deep research by the Claude routine is the default; the in-app search is a fallback.
          onConfirm={() =>
            act(() => api(`/api/personas/${id}/${data.deepResearchEnabled ? "deep-research" : "research"}`, { method: "POST" }))
          }
        />
      ) : (
        persona.icp && <IcpCard icp={persona.icp} />
      )}

      {persona.version > 0 && <Profile data={data} onStartChat={async () => {
        try {
          const { id: cid } = await api<{ id: string }>(`/api/personas/${id}/conversations`, { method: "POST" });
          router.push(`/chat/${cid}`);
        } catch (e) {
          setError((e as Error).message);
        }
      }} />}

      {persona.status !== "draft" && (
        <Sources data={data} act={act} personaId={id} />
      )}
    </div>
  );
}

const RUN_LABEL: Record<string, string> = {
  requested: "Starting",
  researching: "Researching",
  verifying: "Verifying",
  done: "Done",
  failed: "Failed",
};

/** Deep research by the Claude routine: start it, and follow its progress. */
function DeepResearch({ data, onStart }: { data: PersonaData; onStart: () => void }) {
  const { persona, researchRun: run, deepResearchEnabled } = data;
  const running = ["discovering", "extracting", "synthesizing"].includes(persona.status);
  const active = run && ["requested", "researching", "verifying"].includes(run.status);
  if (!persona.icp || (!deepResearchEnabled && !run)) return null;
  return (
    <section className="flex flex-wrap items-center gap-3 rounded-lg border border-violet-300 p-3 text-sm dark:border-violet-900">
      <div className="min-w-0 flex-1">
        <div className="font-medium">Deep research with Claude</div>
        {run ? (
          <div className="text-zinc-500">
            {run.mode === "update" ? "Update" : "Research"} · {RUN_LABEL[run.status] ?? run.status}
            {run.detail ? ` · ${run.detail}` : ""}
            {run.sessionUrl && (
              <>
                {" · "}
                <a href={run.sessionUrl} target="_blank" rel="noreferrer noopener" className="underline">
                  watch the session
                </a>
              </>
            )}
          </div>
        ) : (
          <div className="text-zinc-500">
            Exhaustive, multi-round research by a Claude agent. Everything it finds is re-fetched and verified word for word here before use.
          </div>
        )}
      </div>
      {deepResearchEnabled && !active && !running && persona.version > 0 && (
        <Button onClick={onStart}>Update this persona</Button>
      )}
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
        {pending && <p className="animate-pulse text-sm text-zinc-500">Thinking (may search the web)…</p>}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <form onSubmit={send} className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type your answer…"
          className="flex-1 rounded border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
        />
        <Button type="submit" disabled={!!pending}>Send</Button>
      </form>
      {icp && (
        <div className="flex items-center gap-3 rounded border border-emerald-300 p-3 dark:border-emerald-900">
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

const ANSWER_CLS: Record<string, string> = {
  answered: "text-emerald-700 dark:text-emerald-400",
  partial: "text-amber-700 dark:text-amber-400",
  unknown: "text-zinc-500",
};

const CATEGORY_LABEL: Record<string, string> = {
  opinion: "Opinions", belief: "Beliefs", budget: "Budget", responsibility: "Responsibilities", trait: "Traits",
  goal: "Goals", pain_point: "Pain points", decision_process: "How they decide", objection: "Objections",
  language: "How they talk", history: "History",
};

function Profile({ data, onStartChat }: { data: PersonaData; onStartChat: () => void }) {
  const idx = useMemo(() => buildIndex(data), [data]);
  const groups = useMemo(() => {
    const m = new Map<string, typeof data.elements>();
    for (const e of data.elements) m.set(e.category, [...(m.get(e.category) ?? []), e]);
    return [...m].sort((a, b) => Object.keys(CATEGORY_LABEL).indexOf(a[0]) - Object.keys(CATEGORY_LABEL).indexOf(b[0]));
  }, [data]);
  const discarded = data.rejections.reduce((n, r) => n + r.count, 0);

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-zinc-100 p-4 dark:bg-zinc-900">
        <div className="text-sm">
          <div className="font-medium">Chat with {data.persona.icp?.anchor_name ?? data.persona.name}</div>
          <div className="text-zinc-500">A simulation built only from public statements. Each conversation starts fresh.</div>
        </div>
        <Button onClick={onStartChat}>Start a conversation</Button>
      </div>

      {data.conversations.length > 0 && (
        <div>
          <h3 className="mb-1 text-sm font-medium text-zinc-500">Past conversations</h3>
          <ul className="space-y-1 text-sm">
            {data.conversations.map((c) => (
              <li key={c.id}>
                <Link href={`/chat/${c.id}`} className="underline">{c.title ?? "Untitled conversation"}</Link>
                <span className="ml-2 text-xs text-zinc-500">{c.createdBy} · {new Date(c.createdAt).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.answers.length > 0 && (
        <div>
          <h2 className="mb-2 text-lg font-semibold">Research questions</h2>
          <ul className="space-y-3">
            {data.answers.map((a) => (
              <li key={a.id} className="rounded border border-zinc-200 p-3 dark:border-zinc-800">
                <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
                  {a.question}
                  <span className={`text-xs uppercase ${ANSWER_CLS[a.status]}`}>{a.status}</span>
                  {a.basis && <TierBadge tier={a.basis} />}
                </div>
                <p className="mt-1 text-sm">{a.answer ?? "Not found in any public source. The persona will say so rather than guess."}</p>
                <EvidenceToggle insightIds={a.insightIds} storyIds={a.storyIds} idx={idx} />
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <h2 className="mb-2 text-lg font-semibold">Profile</h2>
        <p className="mb-3 text-xs text-zinc-500">
          {data.subjects.length} verified sources of evidence · {data.insights.length} quotes · {data.stories.length} stories
          {discarded > 0 && ` · ${discarded} items discarded by the verifier`}
        </p>
        <div className="space-y-5">
          {groups.map(([cat, els]) => (
            <div key={cat}>
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500">{CATEGORY_LABEL[cat] ?? cat}</h3>
              <ul className="space-y-2">
                {els.map((e) => (
                  <li key={e.id} className="rounded border border-zinc-200 p-3 dark:border-zinc-800">
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
      </div>
    </section>
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
          <div className="flex items-center gap-2">
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
          className="flex flex-wrap gap-2"
        >
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Add a URL (podcast transcript, interview, article, filing…)"
            className="min-w-64 flex-1 rounded border border-zinc-300 bg-transparent px-3 py-1.5 text-sm dark:border-zinc-700"
          />
          <select value={tier} onChange={(e) => setTier(e.target.value)} className="rounded border border-zinc-300 bg-transparent px-2 text-sm dark:border-zinc-700">
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
          <a href={s.url} target="_blank" rel="noreferrer noopener" className="font-medium underline break-words">
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
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500">{SOURCE_STATUS[s.status] ?? s.status}</span>
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
