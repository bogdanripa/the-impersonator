"use client";

import { useEffect, useRef, useState } from "react";
import type { PersonaData } from "@/lib/client-types";
import { PersonaPhoto } from "@/components/persona-card";

const firstName = (name: string) => name.split(/\s+/)[0] ?? name;

/**
 * The research is the background; the product is the conversation. A prominent "ask them
 * anything" box with suggested questions: sending one opens a conversation with it already asked.
 */
export function TalkPrompt({ data, onAsk }: { data: PersonaData; onAsk: (question?: string) => void }) {
  const [text, setText] = useState("");
  const name = data.persona.icp?.anchor_name ?? data.persona.name;
  const suggestions = (data.persona.icp?.research_questions ?? []).slice(0, 3);
  return (
    <section className="rounded-2xl border border-emerald-300 bg-gradient-to-br from-emerald-500/10 via-transparent to-indigo-500/10 p-4 dark:border-emerald-900 sm:p-5">
      <div className="flex items-center gap-3">
        <PersonaPhoto persona={data.persona} size="md" />
        <div className="min-w-0">
          <h2 className="text-lg font-semibold leading-tight">Talk to {firstName(name)}</h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">Ask anything, in a real conversation. Every answer shows what it&apos;s based on.</p>
        </div>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onAsk(text.trim() || undefined);
        }}
        className="mt-4 flex gap-2"
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          enterKeyHint="send"
          placeholder={`Ask ${firstName(name)} a question…`}
          className="min-w-0 flex-1 rounded-full border border-zinc-300 bg-[var(--background)] px-4 py-2.5 text-sm dark:border-zinc-700"
        />
        <button type="submit" className="shrink-0 rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900">
          {text.trim() ? "Ask" : "Start chatting"}
        </button>
      </form>
      {suggestions.length > 0 && (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {suggestions.map((q) => (
            <button
              key={q}
              onClick={() => onAsk(q)}
              className="rounded-xl border border-zinc-300 bg-[var(--background)] px-3 py-2 text-left text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900 sm:max-w-[32%]"
            >
              <span className="line-clamp-2">{q}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

/** Phones: a button fixed at the bottom of the screen, so the conversation is always one tap away. */
export function TalkBar({ data, onAsk }: { data: PersonaData; onAsk: () => void }) {
  const name = data.persona.icp?.anchor_name ?? data.persona.name;
  return (
    <>
      <div className="h-20 sm:hidden" aria-hidden />
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-zinc-200 bg-[var(--background)]/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur dark:border-zinc-800 sm:hidden print:hidden">
        <button onClick={onAsk} className="flex w-full items-center justify-center gap-2 rounded-full bg-zinc-900 py-3 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900">
          💬 Chat with {firstName(name)}
        </button>
      </div>
    </>
  );
}

const seenKey = (id: string) => `talk-intro-seen:${id}`;

/**
 * Shown once per persona (per browser) when it's ready: what's on this page is the research;
 * the point is to talk to them. A centred dialog on desktop, a bottom sheet on phones.
 */
export function TalkIntro({ data, onAsk }: { data: PersonaData; onAsk: () => void }) {
  const id = data.persona.id;
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    let seen = true;
    try {
      seen = localStorage.getItem(seenKey(id)) === "1";
    } catch {
      // storage blocked: don't nag
    }
    if (seen) return;
    const t = setTimeout(() => setOpen(true), 600);
    return () => clearTimeout(t);
  }, [id]);
  useEffect(() => {
    if (!open) return;
    button.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  function close() {
    setOpen(false);
    try {
      localStorage.setItem(seenKey(id), "1");
    } catch {
      // fine
    }
  }
  if (!open) return null;
  const name = data.persona.icp?.anchor_name ?? data.persona.name;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onClick={close} role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="talk-intro-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-t-2xl bg-[var(--background)] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl sm:rounded-2xl"
      >
        <div className="flex items-center gap-3">
          <PersonaPhoto persona={data.persona} size="lg" />
          <div className="min-w-0">
            <h2 id="talk-intro-title" className="text-lg font-semibold leading-tight">
              {firstName(name)} is ready to talk
            </h2>
            <p className="text-sm text-zinc-500">{data.persona.icp ? `${data.persona.icp.anchor_role} · ${data.persona.icp.anchor_company}` : ""}</p>
          </div>
        </div>
        <p className="mt-4 text-sm leading-6 text-zinc-700 dark:text-zinc-300">
          This page is the research behind the persona: what they said, the answers we found, and the people you could call. The real value is
          the conversation: ask {firstName(name)} anything, push back, ask why. Every answer shows the quotes it rests on, and says when it&apos;s
          only an educated guess.
        </p>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row-reverse">
          <button
            ref={button}
            onClick={() => {
              close();
              onAsk();
            }}
            className="flex-1 rounded-full bg-zinc-900 py-3 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
          >
            Start a conversation
          </button>
          <button onClick={close} className="flex-1 rounded-full border border-zinc-300 py-3 text-sm dark:border-zinc-700">
            Look at the research first
          </button>
        </div>
      </div>
    </div>
  );
}
