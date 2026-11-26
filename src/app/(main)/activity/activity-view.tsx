"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api-client";

type Workspace = {
  org: string; personas: number; ready: number; conversations: number; messages: number;
  events_7d: number; problems_7d: number; last_activity: string | null; people: number;
};
type Event = {
  id: string; createdAt: string; org: string | null; kind: string; level: string; message: string; actor: string | null;
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
  // Admins (ADMIN_EMAILS) can read every workspace's log; the API refuses everyone else.
  const all = params.get("all") === "1";
  const [org, setOrg] = useState<string | null>(null);
  const [overview, setOverview] = useState<Workspace[] | null>(null);
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
      if (all) q.set("all", "1");
      if (all && org) q.set("org", org);
      if (before) q.set("before", before);
      return api<{ events: Event[]; overview?: Workspace[] }>(`/api/events?${q}`);
    },
    [area, problems, persona, all, org],
  );
  useEffect(() => {
    let cancelled = false;
    query().then(
      ({ events: rows, overview: ws }) => {
        if (cancelled) return;
        setEvents(rows);
        if (ws) setOverview(ws);
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
      <div className="pb-3">
        <Link href="/" className="inline-flex items-center gap-1 py-1 pr-2 text-sm text-zinc-500 hover:text-zinc-900 hover:underline dark:hover:text-zinc-100">
          ← All personas
        </Link>
      </div>
      <div>
        <h1 className="text-xl font-semibold">{all ? "Admin: all workspaces" : "Activity log"}</h1>
        <p className="mt-1 text-sm text-zinc-500">
          {all ? "Every workspace's activity" : "What happened in your workspace"}: setup chats, research runs and the problems they hit,
          conversations, LinkedIn reads and errors.
          {all ? (
            <>
              {" "}<Link href="/activity" className="underline">Only my workspace</Link>.
            </>
          ) : null}
          {persona && (
            <>
              {" "}Showing one persona. <Link href="/activity" className="underline">Show everything</Link>.
            </>
          )}
        </p>
      </div>
      {all && overview && (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-zinc-100 text-xs text-zinc-500 dark:bg-zinc-900">
              <tr>
                {["Workspace", "Personas (ready)", "Conversations", "Messages", "People", "Events 7d", "Problems 7d", "Last activity"].map((h) => (
                  <th key={h} className="px-3 py-2 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {overview.map((w) => (
                <tr
                  key={w.org}
                  onClick={() => setOrg(org === w.org ? null : w.org)}
                  className={`cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-900 ${org === w.org ? "bg-zinc-100 dark:bg-zinc-900" : ""}`}
                >
                  <td className="px-3 py-2 font-medium [overflow-wrap:anywhere]">{w.org}</td>
                  <td className="px-3 py-2">{w.personas} ({w.ready})</td>
                  <td className="px-3 py-2">{w.conversations}</td>
                  <td className="px-3 py-2">{w.messages}</td>
                  <td className="px-3 py-2">{w.people}</td>
                  <td className="px-3 py-2">{w.events_7d}</td>
                  <td className={`px-3 py-2 ${w.problems_7d ? "text-amber-700 dark:text-amber-400" : ""}`}>{w.problems_7d}</td>
                  <td className="px-3 py-2 text-xs text-zinc-500">{w.last_activity ? new Date(w.last_activity).toLocaleString() : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {all && (
        <p className="text-xs text-zinc-500">
          {org ? (
            <>
              Showing {org === "-" ? "system-wide events" : org}. <button onClick={() => setOrg(null)} className="underline">Show all workspaces</button>
            </>
          ) : (
            <>
              Tap a workspace to see only its events, or <button onClick={() => setOrg("-")} className="underline">system-wide events</button>{" "}
              (refused research tokens, server errors, LinkedIn reads).
            </>
          )}
        </p>
      )}
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
                    {all && <span className="font-medium">{e.org ?? "system"}</span>}
                    {e.actor && <span>by {e.actor}</span>}
                    {e.personaId && (all ? <span>persona {e.personaId.slice(0, 8)}</span> : <Link href={`/personas/${e.personaId}`} className="underline">persona</Link>)}
                    {e.conversationId &&
                      (all ? <span>conversation {e.conversationId.slice(0, 8)}</span> : <Link href={`/chat/${e.conversationId}`} className="underline">conversation</Link>)}
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
