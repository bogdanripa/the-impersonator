"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";

type Me = { email: string; org: string; shared: boolean; admin?: boolean };

/** Whose space this is (shared with a company domain, or private), and sign-out. */
export function AccountMenu() {
  const [me, setMe] = useState<Me | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    api<Me>("/api/me").then(setMe, () => {});
  }, []);
  if (!me) return null;
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="max-w-[45vw] truncate rounded-full border border-zinc-300 px-3 py-1.5 text-xs text-zinc-600 dark:border-zinc-700 dark:text-zinc-400"
        title={me.shared ? `Shared with everyone at ${me.org}` : "Private to you"}
      >
        {me.shared ? me.org : "Private"}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute right-0 z-20 mt-2 w-64 rounded-lg border border-zinc-200 bg-[var(--background)] p-3 text-sm shadow-lg dark:border-zinc-800">
            <div className="truncate font-medium">{me.email}</div>
            <p className="mt-1 text-xs text-zinc-500">
              {me.shared
                ? `Personas and conversations are shared with everyone who signs in with a ${me.org} Google account.`
                : "Personal account: your personas and conversations are private to you. Sign in with a company Google account to share them with colleagues."}
            </p>
            <a href="/activity" className="mt-3 block w-full rounded border border-zinc-300 px-3 py-2 text-center dark:border-zinc-700">
              Activity log
            </a>
            {me.admin && (
              <a href="/activity?all=1" className="mt-2 block w-full rounded border border-zinc-300 px-3 py-2 text-center dark:border-zinc-700">
                Admin: all workspaces
              </a>
            )}
            <form action="/api/auth/logout" method="post" className="mt-2">
              <button type="submit" className="w-full rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700">
                Sign out
              </button>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
