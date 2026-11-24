"use client";

import { useState, type ReactNode } from "react";
import type { Icp } from "@/lib/types";

export type CardPersona = {
  id: string;
  photoSourceUrl?: string | null;
  name: string;
  icp: Icp | null;
  summary?: string | null;
  tagline?: string | null;
  hasPhoto?: boolean;
  hasLogo?: boolean;
};

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");
}

const SIZES = { sm: "h-8 w-8 text-xs", md: "h-10 w-10 text-sm", lg: "h-16 w-16 text-lg", xl: "h-24 w-24 text-2xl" };

/** The person's official photo, or their initials when there's none. */
export function PersonaPhoto({ persona, size = "md" }: { persona: CardPersona; size?: keyof typeof SIZES }) {
  const [failed, setFailed] = useState(false);
  const name = persona.icp?.anchor_name || persona.name;
  const cls = `${SIZES[size]} shrink-0 rounded-full`;
  if (persona.hasPhoto && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- served from our own API, already sized
      <img
        src={`/api/personas/${persona.id}/photo`}
        alt={name}
        title={persona.photoSourceUrl ? `Photo from ${hostOf(persona.photoSourceUrl)}` : undefined}
        onError={() => setFailed(true)}
        className={`${cls} object-cover object-[50%_25%]`}
      />
    );
  }
  // No verified photo: a generated abstract avatar, unique per person and clearly not a photograph.
  const h = hash(name);
  const a = h % 360;
  const b = (a + 40 + ((h >> 9) % 80)) % 360;
  const angle = (h >> 3) % 360;
  return (
    <div
      aria-label={`${name} (no photo available)`}
      title="No verified photo found"
      className={`${cls} flex items-center justify-center font-semibold text-white`}
      style={{
        backgroundImage: `radial-gradient(circle at ${20 + (h % 60)}% ${20 + ((h >> 5) % 60)}%, hsl(${b} 70% 60% / 0.9), transparent 60%), linear-gradient(${angle}deg, hsl(${a} 55% 38%), hsl(${b} 60% 30%))`,
        textShadow: "0 1px 2px rgb(0 0 0 / 0.35)",
      }}
    >
      {initials(name)}
    </div>
  );
}

function hostOf(u: string) {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return u;
  }
}

function hash(v: string) {
  let h = 2166136261;
  for (const ch of v) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return h;
}

export function CompanyLogo({ persona, size = 16 }: { persona: CardPersona; size?: number }) {
  const [failed, setFailed] = useState(false);
  if (!persona.hasLogo || failed) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- tiny favicon from our own API
    <img
      src={`/api/personas/${persona.id}/logo`}
      alt=""
      width={size}
      height={size}
      onError={() => setFailed(true)}
      className="shrink-0 rounded-sm bg-white object-contain"
      style={{ width: size, height: size }}
    />
  );
}

/** Glanceable card: photo, name, title, company with logo, and a one-line description. */
export function PersonaCard({ persona, aside }: { persona: CardPersona; aside?: ReactNode }) {
  const icp = persona.icp;
  const name = icp?.anchor_name || persona.name;
  return (
    <div className="flex h-full flex-col items-center rounded-xl border border-zinc-200 p-5 text-center transition hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:border-zinc-600 dark:hover:bg-zinc-900">
      <PersonaPhoto persona={persona} size="xl" />
      <div className="mt-3 font-semibold">{name}</div>
      {icp && <div className="mt-0.5 line-clamp-2 text-sm text-zinc-500">{icp.anchor_role}</div>}
      {icp && (
        <div className="mt-2 flex items-center gap-1.5 text-sm font-medium">
          <CompanyLogo persona={persona} />
          {icp.anchor_company}
        </div>
      )}
      {persona.tagline && <p className="mt-3 line-clamp-2 text-sm text-zinc-600 dark:text-zinc-400">{persona.tagline}</p>}
      {aside && <div className="mt-3">{aside}</div>}
    </div>
  );
}

/** Wide header version for the profile page. */
export function PersonaHeader({ persona, footer }: { persona: CardPersona; footer?: ReactNode }) {
  const icp = persona.icp;
  const name = icp?.anchor_name || persona.name;
  return (
    <div className="flex items-start gap-4">
      <PersonaPhoto persona={persona} size="lg" />
      <div className="min-w-0 flex-1">
        <h1 className="text-2xl font-semibold">{name}</h1>
        {icp && (
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-sm text-zinc-600 dark:text-zinc-400">
            {icp.anchor_role} ·
            <CompanyLogo persona={persona} />
            <span className="font-medium text-zinc-900 dark:text-zinc-100">{icp.anchor_company}</span>
            {icp.anchor_linkedin_url && (
              <a href={icp.anchor_linkedin_url} target="_blank" rel="noreferrer noopener" className="ml-1 underline">
                LinkedIn ↗
              </a>
            )}
          </div>
        )}
        {persona.tagline && <p className="mt-2 font-medium">{persona.tagline}</p>}
        {persona.summary && <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{persona.summary}</p>}
        {footer && <div className="mt-2">{footer}</div>}
      </div>
    </div>
  );
}
