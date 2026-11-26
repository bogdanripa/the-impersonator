"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api-client";

type Event = {
  id: string; createdAt: string; kind: string; level: string; message: string; actor: string | null;
  personaId: string | null; conversationId: string | null; runId: string | null; durationMs: number | null;
  data: Record<string, unknown> | null;
};

const AREAS: [string, string][] = [
  ["", "Everything"], ["builder", "Setup chats"], ["research", "Research runs"], ["chat", "Conversations"],
  ["linkedin", "LinkedIn"], ["persona", "Personas"], ["server", "Errors"],
];

const LEVEL: Record<string, string> = {
  info: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  warn: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  error: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
};

function duration(ms: number) {
  if (ms < 1000) return `${ms} ms`;
  if (ms < 120_000) return `${(ms / 1000).toFixed(1)} s`;
  return `${Math.round(ms / 60_000)} min`;
}

/** Everything that happened in this company's space: for learning from production and fixing mistakes. */
export default function ActivityView() {
  const params = useSearchParams();
  const persona = params.get("persona");
  const [area, setArea] = useState("");
  const [problems, setProblems] = useState(false);
  const [events, setEvents] = useState<Event[] | null>(null);
  const [more, setMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const query = useCallback(
    (before?: string) => {
      const q = new URLSearchParams();
      if (area) q.set("area", area);
      if (problems) q.set("problems", "1");
      if (persona) q.set("persona", persona);
      if (before) q.set("before", before);
      return api<{ events: Event[] }>(`/api/events?${q}`);
    },
    [area, problems, persona],
  );
  useEffect(() => {
    let cancelled = false;
    query().then(
      ({ events: rows }) => {
        if (cancelled) return;
        setEvents(rows);
        setMore(rows.length === 100);
      },
      (e) => !cancelled && setError((e as Error).message),
    );
    return () => {
      cancelled = true;
    };
  }, [query]);
  const older = async () => {
    try {
      const { events: rows } = await query(events?.at(-1)?.createdAt);
      setEvents((cur) => [...(cur ?? []), ...rows]);
      setMore(rows.length === 100);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="space-y-4">
      <Link href="/" className="text-xs text-zinc-500 hover:underline">← All personas</Link>
      <div>
        <h1 className="text-xl font-semibold">Activity log</h1>
        <p className="mt-1 text-sm text-zinc-500">
          What happened in your workspace: setup chats, research runs and the problems they hit, conversations, LinkedIn reads and errors.
          {persona && (
            <>
              {" "}Showing one persona. <Link href="/activity" className="underline">Show everything</Link>.
            </>
          )}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 overflow-x-auto">
          {AREAS.map(([v, label]) => (
            <button
              key={v}
              onClick={() => setArea(v)}
              className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs ${area === v ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "border border-zinc-300 dark:border-zinc-700"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="ml-auto flex items-center gap-2 text-xs">
          <input type="checkbox" checked={problems} onChange={(e) => setProblems(e.target.checked)} /> Problems only
        </label>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!events ? (
        <p className="text-sm text-zinc-500">Loading…</p>
      ) : events.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700">Nothing logged yet.</p>
      ) : (
        <ul className="divide-y divide-zinc-200 overflow-hidden rounded-xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {events.map((e) => (
            <li key={e.id} className="px-4 py-3 text-sm">
              <details>
                <summary className="cursor-pointer list-none">
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${LEVEL[e.level] ?? LEVEL.info}`}>{e.kind}</span>
                    <span className="text-xs text-zinc-500">
                      {new Date(e.createdAt).toLocaleString()}
                      {e.durationMs != null && ` · ${duration(e.durationMs)}`}
                    </span>
                  </div>
                  <div className="mt-1 [overflow-wrap:anywhere]">{e.message}</div>
                </summary>
                <div className="mt-2 space-y-2 text-xs text-zinc-600 dark:text-zinc-400">
                  <div className="flex flex-wrap gap-x-3 gap-y-1">
                    {e.actor && <span>by {e.actor}</span>}
                    {e.personaId && <Link href={`/personas/${e.personaId}`} className="underline">persona</Link>}
                    {e.conversationId && <Link href={`/chat/${e.conversationId}`} className="underline">conversation</Link>}
                    {e.runId && <span>run {e.runId.slice(0, 8)}</span>}
                  </div>
                  {e.data && (
                    <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded bg-zinc-100 p-3 font-mono text-[11px] [overflow-wrap:anywhere] dark:bg-zinc-900">
                      {JSON.stringify(e.data, null, 2)}
                    </pre>
                  )}
                </div>
              </details>
            </li>
          ))}
        </ul>
      )}
      {more && events && (
        <button onClick={older} className="w-full rounded-lg border border-zinc-300 py-2 text-sm dark:border-zinc-700">
          Older
        </button>
      )}
    </div>
  );
}
