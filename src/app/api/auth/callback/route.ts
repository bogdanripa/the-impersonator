import { NextResponse, type NextRequest } from "next/server";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { OAUTH_COOKIE, SESSION_COOKIE, appOrigin, readOauthState, signSession } from "@/lib/auth";
import { orgFor } from "@/lib/org";

const googleJwks = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

function fail(request: NextRequest, message: string) {
  const url = new URL("/login", appOrigin(request.url));
  url.searchParams.set("error", message);
  const res = NextResponse.redirect(url);
  res.cookies.delete({ name: OAUTH_COOKIE, path: "/api/auth" });
  return res;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const saved = await readOauthState(request.cookies.get(OAUTH_COOKIE)?.value);
  if (params.get("error")) return fail(request, "Sign-in was cancelled.");
  if (!saved || saved.state !== params.get("state") || !params.get("code")) {
    return fail(request, "Sign-in expired. Please try again.");
  }

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: params.get("code")!,
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      redirect_uri: `${appOrigin(request.url)}/api/auth/callback`,
      grant_type: "authorization_code",
      code_verifier: saved.verifier,
    }),
  });
  const tokens = (await tokenRes.json().catch(() => ({}))) as { id_token?: string };
  if (!tokenRes.ok || !tokens.id_token) return fail(request, "Google sign-in failed.");

  let claims: Record<string, unknown>;
  try {
    ({ payload: claims } = await jwtVerify(tokens.id_token, googleJwks, {
      issuer: ["https://accounts.google.com", "accounts.google.com"],
      audience: process.env.GOOGLE_CLIENT_ID,
    }));
  } catch {
    return fail(request, "Could not verify the Google sign-in.");
  }

  const email = String(claims.email ?? "").toLowerCase();
  const hostedDomain = String(claims.hd ?? "").toLowerCase();
  // Any Google account with a verified email. Workspace accounts (hd claim) share a space with their
  // company domain; personal accounts get a private one.
  if (claims.email_verified !== true || !email.includes("@")) {
    return fail(request, "This Google account's email address isn't verified.");
  }
  const org = orgFor(email, hostedDomain || null);

  const res = NextResponse.redirect(new URL(saved.next, appOrigin(request.url)));
  res.cookies.delete({ name: OAUTH_COOKIE, path: "/api/auth" });
  res.cookies.set(SESSION_COOKIE, await signSession({ email, name: String(claims.name ?? email), org }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
