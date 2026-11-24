"use client";

import type { ReactNode } from "react";

const STATUS: Record<string, { label: string; cls: string }> = {
  draft: { label: "Defining", cls: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300" },
  discovering: { label: "Searching", cls: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300" },
  reviewing: { label: "Review sources", cls: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" },
  extracting: { label: "Verifying", cls: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300" },
  synthesizing: { label: "Building", cls: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300" },
  ready: { label: "Ready", cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" },
  failed: { label: "Needs attention", cls: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300" },
};

export function StatusPill({ status }: { status: string }) {
  const s = STATUS[status] ?? { label: status, cls: "bg-zinc-200 text-zinc-700" };
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${s.cls}`}>{s.label}</span>;
}

const TIER: Record<string, { label: string; cls: string }> = {
  anchor: { label: "Their own words", cls: "bg-emerald-600 text-white" },
  company: { label: "Company", cls: "bg-indigo-600 text-white" },
  peer: { label: "Peer", cls: "border border-amber-500 text-amber-700 dark:text-amber-400" },
  peers: { label: "Peers", cls: "border border-amber-500 text-amber-700 dark:text-amber-400" },
};

/** Visual distinction between the anchor's own words, company facts and peer material. */
export function TierBadge({ tier }: { tier: string }) {
  const parts = tier.split("+");
  return (
    <span className="inline-flex gap-1">
      {parts.map((p) => {
        const t = TIER[p] ?? { label: p, cls: "border border-zinc-400" };
        return (
          <span key={p} className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${t.cls}`}>
            {t.label}
          </span>
        );
      })}
    </span>
  );
}

export function Button({
  children,
  onClick,
  disabled,
  variant = "primary",
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "danger";
  type?: "button" | "submit";
}) {
  const cls =
    variant === "primary"
      ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
      : variant === "danger"
        ? "border border-red-300 text-red-700 dark:border-red-900 dark:text-red-400"
        : "border border-zinc-300 dark:border-zinc-700";
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`rounded px-3 py-1.5 text-sm disabled:opacity-50 ${cls}`}>
      {children}
    </button>
  );
}
