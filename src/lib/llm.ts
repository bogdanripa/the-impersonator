import OpenAI from "openai";

/**
 * Model client. OPENAI_PROVIDER=azure uses the Azure OpenAI v1 endpoint
 * (AZURE_OPENAI_ENDPOINT ends in /openai/v1); otherwise the public OpenAI API.
 */
let client: OpenAI | null = null;

export function llm(): OpenAI {
  if (client) return client;
  if (process.env.OPENAI_PROVIDER === "azure") {
    const apiKey = process.env.AZURE_OPENAI_API_KEY;
    client = new OpenAI({
      baseURL: process.env.AZURE_OPENAI_ENDPOINT,
      apiKey,
      defaultHeaders: { "api-key": apiKey ?? "" },
      timeout: 15 * 60 * 1000,
    });
  } else {
    client = new OpenAI({ timeout: 15 * 60 * 1000 });
  }
  return client;
}

/** On Azure this is the deployment name. */
export const MODEL = process.env.OPENAI_MODEL ?? "gpt-5.5";

export class ModelRefusalError extends Error {}
export class IncompleteOutputError extends Error {}

type AnyResponse = { status?: string | null; incomplete_details?: { reason?: string } | null; output: unknown[] };

/** Every caller must check this before using a response. */
export function checkResponse(response: AnyResponse) {
  if (response.status === "incomplete") {
    throw new IncompleteOutputError(`Model output incomplete (${response.incomplete_details?.reason ?? "unknown"}).`);
  }
  for (const item of response.output as { type: string; content?: { type: string; refusal?: string }[] }[]) {
    if (item.type !== "message") continue;
    const refusal = item.content?.find((c) => c.type === "refusal");
    if (refusal) throw new ModelRefusalError(`Model declined: ${refusal.refusal ?? ""}`);
  }
}
