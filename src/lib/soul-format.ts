import type { SoulSection, SoulSheet } from "@/lib/db/schema";

/** SOUL.md text, with numbered quote footnotes. */
export function soulMarkdown(
  name: string,
  soul: { sections: SoulSection[]; sheet: SoulSheet },
  quoteOf: (id: string) => { quote: string; who: string; url: string } | undefined,
) {
  const notes: string[] = [];
  const cite = (ids: string[]) =>
    ids
      .map((id) => {
        const q = quoteOf(id);
        if (!q) return "";
        notes.push(`"${q.quote}" (${q.who}, ${q.url})`);
        return `[^${notes.length}]`;
      })
      .join("");
  const lines = [`# SOUL.md: ${name}`, "", "_A simulation built only from public statements. Every section cites its quotes._", ""];
  for (const s of soul.sections) lines.push(`## ${s.title}`, "", `${s.body} ${cite([...s.insightIds, ...s.storyIds])}`, "");
  const { phrases, scales, lightsUpOn, deflects } = soul.sheet;
  lines.push("## Character sheet", "");
  for (const sc of scales) lines.push(`- **${sc.left} ↔ ${sc.right}:** ${sc.value ? `${sc.value}/5 ${cite(sc.insightIds)}` : "not enough evidence"}`);
  if (phrases.length) lines.push("", "**Signature phrases:**", ...phrases.map((p) => `- "${p.phrase}" ${cite([p.insightId])}`));
  if (lightsUpOn.length) lines.push("", "**Lights up on:**", ...lightsUpOn.map((t) => `- ${t.topic} ${cite(t.insightIds)}`));
  if (deflects.length) lines.push("", "**Deflects:**", ...deflects.map((t) => `- ${t.topic} ${cite(t.insightIds)}`));
  lines.push("", "---", "", ...notes.map((n, i) => `[^${i + 1}]: ${n}`), "");
  return lines.join("\n");
}
