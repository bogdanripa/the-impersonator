import type { Icp } from "@/lib/types";
import type { SoulSection, SoulSheet } from "@/lib/db/schema";

export type Source = {
  id: string; url: string; title: string | null; tier: string; publisher: string | null; publishedAt: string | null;
  origin: string; claimedSubjectName: string | null; claimedSubjectRole: string | null; fitReason: string | null;
  fitScore: number | null; status: string; subjectId: string | null; error: string | null;
  acceptedCount: number; rejectedCount: number;
};
export type Subject = { id: string; name: string; role: string | null; organization: string | null; isAnchor: boolean; kind: string };
export type Insight = { id: string; sourceId: string; subjectId: string; kind: string; summary: string; quote: string };
export type Story = {
  id: string; sourceId: string; subjectId: string; title: string; situation: string; action: string;
  outcome: string; lesson: string | null; quote: string;
};
export type Element = {
  id: string; category: string; title: string; description: string; disagreement: string | null; basis: string;
  insightIds: string[]; storyIds: string[]; subjectCount: number;
};
export type Answer = {
  id: string; question: string; status: string; answer: string | null; basis: string | null;
  insightIds: string[]; storyIds: string[];
};
export type PersonaData = {
  persona: {
    id: string; name: string; status: string; statusDetail: string | null; icp: Icp | null; version: number;
    summary: string | null; summaryInsightIds: string[]; summaryStoryIds: string[]; pendingIcp: Icp | null;
    tagline: string | null; hasPhoto: boolean; hasLogo: boolean; photoSourceUrl: string | null;
    soulStatus: string | null; soulError: string | null;
  };
  builder: { role: "user" | "assistant"; content: string; icp?: Icp }[];
  sources: Source[];
  subjects: Subject[];
  elements: Element[];
  answers: Answer[];
  insights: Insight[];
  stories: Story[];
  rejections: { stage: string; count: number }[];
  conversations: { id: string; title: string | null; createdAt: string; createdBy: string | null }[];
  researchRun: {
    id: string; mode: string; status: string; detail: string | null; sessionUrl: string | null; createdAt: string; updatedAt: string;
  } | null;
  deepResearchEnabled: boolean;
  soul: { sections: SoulSection[]; sheet: SoulSheet } | null;
};
