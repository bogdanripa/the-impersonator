import { SignJWT, jwtVerify } from "jose";
import { orgFor, orgForDomain } from "@/lib/org";

export const SESSION_COOKIE = "imp_session";
export const OAUTH_COOKIE = "imp_oauth";

/** Any verified Google account can sign in; what it sees is scoped by its space (see org.ts). */
export type Session = { email: string; name: string; org: string };

function secret(): Uint8Array {
  const s = process.env.AUTH_SECRET;
  if (!s) {
    if (process.env.NODE_ENV === "production") throw new Error("AUTH_SECRET is not set");
    // Local development only.
    return new TextEncoder().encode(`dev-only:${process.env.GOOGLE_CLIENT_SECRET ?? "the-impersonator"}`);
  }
  return new TextEncoder().encode(s);
}

export async function signSession(session: Session): Promise<string> {
  return new SignJWT({ ...session })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .setAudience("session")
    .sign(secret());
}

export async function readSession(token: string | undefined): Promise<Session | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { audience: "session" });
    const email = String(payload.email ?? "").toLowerCase();
    if (!email.includes("@")) return null;
    // Sessions from before spaces existed were all Workspace accounts: their domain is their space.
    const org = payload.org ? orgForSession(String(payload.org), email) : orgForDomain(email.split("@")[1]);
    return { email, name: String(payload.name ?? email), org };
  } catch {
    return null;
  }
}

/** Re-applies domain aliases, so changing ORG_DOMAIN_ALIASES takes effect without signing in again. */
function orgForSession(org: string, email: string): string {
  return org.includes("@") ? orgFor(email) : orgForDomain(org);
}

/** Short-lived signed cookie carrying OAuth state + PKCE verifier between login and callback. */
export async function signOauthState(data: { state: string; verifier: string; next: string }) {
  return new SignJWT(data).setProtectedHeader({ alg: "HS256" }).setExpirationTime("10m").setAudience("oauth").sign(secret());
}

export async function readOauthState(token: string | undefined) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { audience: "oauth" });
    return payload as unknown as { state: string; verifier: string; next: string };
  } catch {
    return null;
  }
}

export function safeNext(next: string | null | undefined): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

export function appOrigin(requestUrl: string): string {
  return process.env.APP_URL?.replace(/\/$/, "") ?? new URL(requestUrl).origin;
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (!a || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
