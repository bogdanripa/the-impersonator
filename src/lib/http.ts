import { NextResponse } from "next/server";
import OpenAI from "openai";
import { ModelRefusalError } from "@/lib/llm";

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

/** Maps errors to safe client messages; full detail goes to the server log. */
export function handleError(err: unknown) {
  console.error(err);
  if (err instanceof ModelRefusalError) return jsonError("The model declined this request.", 422);
  if (err instanceof OpenAI.RateLimitError) return jsonError("Rate limited by the model API. Try again shortly.", 429);
  if (err instanceof OpenAI.AuthenticationError) return jsonError("Model API key is missing or invalid.", 500);
  if (err instanceof OpenAI.APIError) return jsonError(`Model API error (${err.status ?? "network"}).`, 502);
  return jsonError("Something went wrong.", 500);
}
