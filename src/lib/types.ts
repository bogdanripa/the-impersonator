import { z } from "zod";

/**
 * What to build: one real, named person (the anchor), plus the profile of similar
 * people whose interviews can fill gaps the anchor hasn't spoken about publicly.
 */
export const IcpSchema = z.object({
  persona_name: z.string().describe("Display label, e.g. 'Jane Doe, CMO at Acme'"),
  anchor_name: z.string().describe("Full real name of the person to simulate"),
  anchor_role: z.string().describe("Their current job title"),
  anchor_company: z.string().describe("Their current company"),
  anchor_linkedin_url: z.string().describe("LinkedIn profile URL seen in search results or given by the user; empty if not found"),
  identity_evidence: z.array(z.string()).describe("URLs from search results that confirm who this person is and where they work"),
  anchor_photo_url: z
    .string()
    .describe("Direct URL of an official headshot image, taken from anchor_photo_page; empty if none found. Never construct one."),
  anchor_photo_page: z
    .string()
    .describe("Official page (company leadership/newsroom/speaker page) that shows the photo and names the person; empty if none"),
  company_domain: z.string().describe("The company's main website domain, e.g. diageo.com"),
  peer_role: z.string().describe("Job title(s) of similar people to use as supplementary evidence"),
  peer_seniority: z.string(),
  peer_company_profile: z.string().describe("Company size, type, revenue band, business model of similar people"),
  peer_industries: z.array(z.string()),
  peer_regions: z.array(z.string()),
  learning_goals: z.array(z.string()).describe("What the user wants to learn from this persona"),
  research_questions: z
    .array(z.string())
    .describe(
      "Specific things the persona must know or have a view on, phrased as questions. E.g. for a marketing leader: total marketing budget; how it splits across buckets (brand, performance, agencies, martech, events, headcount); which areas they own personally vs delegate to someone on their team; their opinion on how AI is changing their world",
    ),
  exclusions: z.array(z.string()).describe("People or source types to exclude"),
  research_focus: z
    .string()
    .describe("What the next research run should focus on (e.g. 'newer interviews since 2025; budget split; AI'). Empty for a first run if there's nothing specific."),
});
export type Icp = z.infer<typeof IcpSchema>;

/**
 * Why a setup can't be researched yet: every persona is ONE real, named person. Empty when it can.
 * (Research once started on a setup with no person at all; the routine rightly refused.)
 */
export function missingAnchor(icp: Pick<Icp, "anchor_name" | "anchor_role" | "anchor_company"> | null | undefined): string[] {
  if (!icp) return ["the person to simulate"];
  const missing: string[] = [];
  if (icp.anchor_name.trim().split(/\s+/).length < 2) missing.push("the person's full name");
  if (!icp.anchor_role.trim()) missing.push("their role");
  if (!icp.anchor_company.trim()) missing.push("their company");
  return missing;
}
