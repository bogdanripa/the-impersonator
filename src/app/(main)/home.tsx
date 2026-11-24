"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import { StatusPill } from "@/components/ui";
import { PersonaCard } from "@/components/persona-card";
import type { Icp } from "@/lib/types";

type Row = {
  id: string; name: string; status: string; statusDetail: string | null; version: number; updatedAt: string;
  icp: Icp | null; summary: string | null;
};

export default function Home() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    api<{ personas: Row[] }>("/api/personas").then((d) => setRows(d.personas), (e) => setError(e.message));
  }, []);

  async function create() {
    setCreating(true);
    try {
      const { id } = await api<{ id: string }>("/api/personas", { method: "POST" });
      router.push(`/personas/${id}`);
    } catch (e) {
      setError((e as Error).message);
      setCreating(false);
    }
  }

  const ready = rows?.filter((r) => r.version > 0) ?? [];
  const building = rows?.filter((r) => r.version === 0) ?? [];

  return (
    <div className="space-y-10">
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        <section className="rounded-lg border border-zinc-200 p-5 dark:border-zinc-800">
          <h2 className="text-lg font-semibold">1. Create ICP</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Pick a real person to simulate. We collect their own interviews and articles, add company material and similar
            people, and keep only verbatim, verified quotes.
          </p>
          <button
            onClick={create}
            disabled={creating}
            className="mt-4 rounded bg-zinc-900 px-4 py-2 text-sm text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
          >
            {creating ? "Creating…" : "Create ICP"}
          </button>
        </section>
        <section className="rounded-lg border border-zinc-200 p-5 dark:border-zinc-800">
          <h2 className="text-lg font-semibold">2. Chat with ICP</h2>
          <p className="mt-1 text-sm text-zinc-500">Every reply shows the real quotes it rests on. Each conversation starts fresh.</p>
          {rows && ready.length === 0 && <p className="mt-4 text-sm text-zinc-500">No ready personas yet.</p>}
          <ul className="mt-3 space-y-3">
            {ready.map((r) => (
              <li key={r.id}>
                <Link href={`/personas/${r.id}`} className="block rounded-lg transition hover:bg-zinc-100 dark:hover:bg-zinc-900">
                  <PersonaCard persona={r} aside={<StatusPill status={r.status} />} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {building.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-medium text-zinc-500">In progress</h3>
          <ul className="space-y-2">
            {building.map((r) => (
              <li key={r.id}>
                <Link href={`/personas/${r.id}`} className="flex items-center justify-between rounded border border-zinc-200 px-3 py-2 text-sm hover:bg-zinc-100 dark:border-zinc-800 dark:hover:bg-zinc-900">
                  <span>{r.name}</span>
                  <span className="flex items-center gap-3">
                    <span className="hidden text-xs text-zinc-500 sm:inline">{r.statusDetail}</span>
                    <StatusPill status={r.status} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
