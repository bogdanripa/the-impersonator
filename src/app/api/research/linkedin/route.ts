import { handleError, jsonError } from "@/lib/http";
import { researchApiAuthorized, researchUnauthorized } from "@/lib/research-runs";
import { fetchLinkedIn, LinkedInUnavailableError, linkedinTarget } from "@/lib/linkedin";

// Reading a profile or posts through Apify can take a couple of minutes.
export const maxDuration = 300;

/**
 * A LinkedIn profile or posts page as text, for the research routine's fetch-text (which has no
 * Apify token). Same bearer token as the rest of the research API; same cached text the verifier reads.
 */
export async function GET(request: Request) {
  try {
    if (!researchApiAuthorized(request)) return researchUnauthorized(request);
    const target = linkedinTarget(new URL(request.url).searchParams.get("url") ?? "");
    if (!target) return jsonError("Not a LinkedIn profile, posts or post URL", 400);
    const page = await fetchLinkedIn(target);
    return new Response(page.text, {
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "x-page-title": encodeURIComponent(page.title ?? ""),
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    if (err instanceof LinkedInUnavailableError) return jsonError(err.message, 503);
    if (err instanceof Error && !(err instanceof TypeError)) return jsonError(err.message, 502);
    return handleError(err);
  }
}
