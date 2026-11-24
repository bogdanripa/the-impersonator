"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";

/** "+" in the header: creates a persona and opens its setup chat. */
export function NewPersonaButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      onClick={async () => {
        setBusy(true);
        try {
          const { id } = await api<{ id: string }>("/api/personas", { method: "POST" });
          router.push(`/personas/${id}`);
        } catch {
          setBusy(false);
        }
      }}
      disabled={busy}
      aria-label="New persona"
      title="New persona"
      className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-900 text-xl leading-none text-white transition hover:scale-105 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
    >
      +
    </button>
  );
}
