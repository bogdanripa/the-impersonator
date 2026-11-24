/**
 * Deterministic quote verification. This is the core "no hallucination" guarantee:
 * a quote is only accepted if it appears word-for-word in the text we fetched ourselves.
 * Only case, punctuation and whitespace differences are tolerated.
 */

export const MIN_QUOTE_WORDS = 8;

export function normalize(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[‘’‛′]/g, "'")
    .replace(/'/g, "") // "don't" and "dont" compare equal
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export type QuoteCheck = { ok: true; offset: number } | { ok: false; reason: string };

export function verifyQuote(normalizedSource: string, quote: string): QuoteCheck {
  if (/\.\.\.|…|\[|\]/.test(quote)) {
    return { ok: false, reason: "Quote contains an ellipsis or editorial brackets; only unaltered quotes are accepted." };
  }
  const q = normalize(quote);
  const words = q.split(" ").filter(Boolean).length;
  if (words < MIN_QUOTE_WORDS) {
    return { ok: false, reason: `Quote too short (${words} words, minimum ${MIN_QUOTE_WORDS}).` };
  }
  const offset = normalizedSource.indexOf(q);
  if (offset < 0) return { ok: false, reason: "Quote not found verbatim in the fetched source text." };
  return { ok: true, offset };
}

export function nameKey(name: string): string {
  return normalize(name);
}
