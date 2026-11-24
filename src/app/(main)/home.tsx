"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { StatusPill } from "@/components/ui";
import { PersonaCard, type CardPersona } from "@/components/persona-card";

type Row = CardPersona & { status: string; statusDetail: string | null; version: number; updatedAt: string };

export default function Home() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ personas: Row[] }>("/api/personas").then((d) => setRows(d.personas), (e) => setError(e.message));
  }, []);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!rows) return <p className="text-sm text-zinc-500">Loading…</p>;

  const ready = rows.filter((r) => r.version > 0);
  const building = rows.filter((r) => r.version === 0);

  return (
    <div className="space-y-10">
      {rows.length === 0 && (
        <p className="py-20 text-center text-zinc-500">No personas yet. Use the + button to create one.</p>
      )}

      {ready.length > 0 && (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ready.map((r) => (
            <li key={r.id}>
              <Link href={`/personas/${r.id}`} className="block h-full">
                <PersonaCard persona={r} aside={r.status !== "ready" ? <StatusPill status={r.status} /> : undefined} />
              </Link>
            </li>
          ))}
        </ul>
      )}

      {building.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-medium text-zinc-500">Being created</h2>
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {building.map((r) => (
              <li key={r.id}>
                <Link href={`/personas/${r.id}`} className="block h-full opacity-80">
                  <PersonaCard persona={r} aside={<StatusPill status={r.status} />} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
