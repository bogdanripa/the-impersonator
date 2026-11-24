"use client";

import type { ReactNode } from "react";
import type { Icp } from "@/lib/types";

export type CardPersona = {
  name: string;
  icp: Icp | null;
  summary: string | null;
};

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
}

/** Name, title, company and an evidence-backed description. */
export function PersonaCard({
  persona,
  compact = false,
  footer,
  aside,
}: {
  persona: CardPersona;
  compact?: boolean;
  footer?: ReactNode;
  aside?: ReactNode;
}) {
  const icp = persona.icp;
  const name = icp?.anchor_name || persona.name;
  return (
    <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="flex items-start gap-3">
        <div
          aria-hidden
          className={`flex shrink-0 items-center justify-center rounded-full bg-zinc-900 font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900 ${
            compact ? "h-9 w-9 text-sm" : "h-12 w-12 text-base"
          }`}
        >
          {initials(name)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <div className={`font-semibold ${compact ? "" : "text-lg"}`}>{name}</div>
              {icp && (
                <div className="text-sm text-zinc-600 dark:text-zinc-400">
                  {icp.anchor_role} · {icp.anchor_company}
                </div>
              )}
            </div>
            {aside}
          </div>
          {!compact && (
            <p className={`mt-2 text-sm ${persona.summary ? "" : "italic text-zinc-500"}`}>
              {persona.summary ?? "No description yet. It appears once their own words have been verified."}
            </p>
          )}
          {icp?.anchor_linkedin_url && !compact && (
            <a href={icp.anchor_linkedin_url} target="_blank" rel="noreferrer noopener" className="mt-1 inline-block text-xs underline">
              LinkedIn ↗
            </a>
          )}
          {footer && <div className="mt-2">{footer}</div>}
        </div>
      </div>
    </div>
  );
}
