import { NextResponse, type NextRequest } from "next/server";
import { OAUTH_COOKIE, appOrigin, safeNext, signOauthState } from "@/lib/auth";

function base64url(bytes: Uint8Array) {
  return Buffer.from(bytes).toString("base64url");
}

export async function GET(request: NextRequest) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return new NextResponse("GOOGLE_CLIENT_ID is not configured", { status: 500 });

  const state = base64url(crypto.getRandomValues(new Uint8Array(24)));
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = base64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
  const next = safeNext(request.nextUrl.searchParams.get("next"));

  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${appOrigin(request.url)}/api/auth/callback`,
    response_type: "code",
    scope: "openid email profile",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  }).toString();

  const res = NextResponse.redirect(url);
  res.cookies.set(OAUTH_COOKIE, await signOauthState({ state, verifier, next }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/auth",
    maxAge: 600,
  });
  return res;
}
