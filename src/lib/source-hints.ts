/**
 * Shows and sites known to feature marketing leaders talking about the operating reality of
 * their teams (priorities, KPIs, budgets, tools, structure, responsibilities, pressure from the
 * CEO/board). We can only use TEXT, never audio, so discovery must find transcript pages.
 *
 * Checked 2026-11-24: most shows don't publish transcripts on their own sites. Readable text
 * exists on bettercmos.com (full), podscan.fm (partial: first segment only), and publisher
 * articles with long quotes. business.google.com/think pages render client-side and can't be read.
 */
export const PODCAST_HINTS = [
  { name: "The CMO Podcast (Jim Stengel)", fit: "large B2C companies and established brands" },
  { name: "The CMO Whisperer (Steve Olenski)", fit: "CMO priorities, pressure and responsibilities" },
  { name: "Scratch: CMO Interviews (Rival)", fit: "B2B and B2C, challenger brands, agencies" },
  { name: "Frontier CMO Podcast by Think with Google", fit: "AI, martech, measurement, proving ROI" },
  { name: "Marketing Against the Grain (HubSpot)", fit: "B2B marketing, growth, demand gen, AI tools" },
  { name: "The Marketing Millennials", fit: "tactics, channels, tools, team execution" },
  { name: "Uncensored CMO (Jon Evans)", fit: "brand vs performance, budgets, proving value" },
  { name: "Building Better CMOs", fit: "senior CMOs; publishes full transcripts" },
  { name: "Marketing Vanguard", fit: "B2C brand leadership, agency relationships" },
];

export const TRANSCRIPT_SITES = [
  "bettercmos.com (full episode transcripts)",
  "podscan.fm (partial episode transcripts for many shows)",
  "the show's own website or blog (look for a 'transcript' link on the episode page)",
  "trade press Q&As with long direct quotes: Marketing Week, The Drum, Campaign, Adweek, Ad Age, Forbes CMO Network, The Grocer",
];

export function sourceHintsText(): string {
  return `Podcasts worth checking (their episodes are only usable where a TEXT transcript exists):
${PODCAST_HINTS.map((p) => `- ${p.name}: ${p.fit}`).join("\n")}

Where readable transcripts and long-form quotes tend to be:
${TRANSCRIPT_SITES.map((s) => `- ${s}`).join("\n")}

Search tactics: "<person> transcript", "<person> <show name> transcript", "<person> podcast transcript", "site:bettercmos.com <person>", "site:podscan.fm <person>", "<person> interview <topic>".
Never submit an audio/video page (Apple Podcasts, Spotify, YouTube) unless the page itself shows the transcript text.`;
}
