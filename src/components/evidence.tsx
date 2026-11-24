"use client";

import { useState } from "react";
import type { Insight, Source, Story, Subject } from "@/lib/client-types";
import { TierBadge } from "@/components/ui";

export type EvidenceIndex = {
  insights: Map<string, Insight>;
  stories: Map<string, Story>;
  subjects: Map<string, Subject>;
  sources: Map<string, Source>;
};

export function buildIndex(d: { insights: Insight[]; stories: Story[]; subjects: Subject[]; sources: Source[] }): EvidenceIndex {
  return {
    insights: new Map(d.insights.map((x) => [x.id, x])),
    stories: new Map(d.stories.map((x) => [x.id, x])),
    subjects: new Map(d.subjects.map((x) => [x.id, x])),
    sources: new Map(d.sources.map((x) => [x.id, x])),
  };
}

export function subjectTier(s: Subject | undefined) {
  return s?.isAnchor ? "anchor" : s?.kind === "company" ? "company" : "peer";
}

/** Verbatim quote + who said it + where, linking to the original page. */
function Quote({ quote, subjectId, sourceId, idx, heading }: { quote: string; subjectId: string; sourceId: string; idx: EvidenceIndex; heading?: string }) {
  const subject = idx.subjects.get(subjectId);
  const source = idx.sources.get(sourceId);
  return (
    <li className="rounded border border-zinc-200 p-2 text-sm dark:border-zinc-800">
      {heading && <div className="mb-1 font-medium">{heading}</div>}
      <blockquote className="border-l-2 border-zinc-300 pl-2 italic dark:border-zinc-700">“{quote}”</blockquote>
      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
        <TierBadge tier={subjectTier(subject)} />
        <span>
          {subject?.name}
          {subject?.role ? `, ${subject.role}` : ""}
          {subject?.organization ? ` (${subject.organization})` : ""}
        </span>
        {source && (
          <a href={source.url} target="_blank" rel="noreferrer noopener" className="underline">
            {source.title ?? new URL(source.url).hostname}
          </a>
        )}
      </div>
    </li>
  );
}

export function EvidenceList({ insightIds, storyIds, idx }: { insightIds: string[]; storyIds: string[]; idx: EvidenceIndex }) {
  const ins = insightIds.map((id) => idx.insights.get(id)).filter((x): x is Insight => !!x);
  const sts = storyIds.map((id) => idx.stories.get(id)).filter((x): x is Story => !!x);
  return (
    <ul className="mt-2 space-y-2">
      {sts.map((s) => (
        <Quote key={s.id} quote={s.quote} subjectId={s.subjectId} sourceId={s.sourceId} idx={idx} heading={`Story: ${s.title}`} />
      ))}
      {ins.map((i) => (
        <Quote key={i.id} quote={i.quote} subjectId={i.subjectId} sourceId={i.sourceId} idx={idx} />
      ))}
    </ul>
  );
}

export function EvidenceToggle({ insightIds, storyIds, idx, label }: { insightIds: string[]; storyIds: string[]; idx: EvidenceIndex; label?: string }) {
  const [open, setOpen] = useState(false);
  const n = insightIds.length + storyIds.length;
  if (!n) return null;
  return (
    <div>
      <button onClick={() => setOpen(!open)} className="text-xs text-zinc-500 underline">
        {open ? "Hide" : label ?? "Show"} evidence ({n})
      </button>
      {open && <EvidenceList insightIds={insightIds} storyIds={storyIds} idx={idx} />}
    </div>
  );
}
