import { NextResponse } from "next/server";
import { processResearchQueue } from "@/lib/research-queue";

export const maxDuration = 60;

/**
 * Nudges the research queue: if nothing is running, start the next persona that a signed-in
 * user queued. It can only start already-queued work, one at a time, and returns no data, so it
 * needs no auth (it lets the queue move overnight without anyone opening the app).
 */
export async function POST() {
  const started = await processResearchQueue().catch((err) => {
    console.error("Research queue", err);
    return null;
  });
  return NextResponse.json({ started: !!started });
}
