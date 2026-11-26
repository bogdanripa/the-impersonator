import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, readSession } from "@/lib/auth";

/** Google sign-in gate. Passes who the viewer is, and which space they belong to, to the routes. */
export async function proxy(request: NextRequest) {
  const session = await readSession(request.cookies.get(SESSION_COOKIE)?.value);
  const path = request.nextUrl.pathname;
  // The marketing page is for visitors: signed-out "/" shows it; signed-in users go to the app.
  if (path === "/welcome") return session ? NextResponse.redirect(new URL("/", request.url)) : NextResponse.next();
  if (!session && path === "/") return NextResponse.rewrite(new URL("/welcome", request.url));
  if (session) {
    const headers = new Headers(request.headers);
    headers.set("x-user-email", session.email);
    headers.set("x-user-org", session.org);
    return NextResponse.next({ request: { headers } });
  }
  if (path.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const login = new URL("/login", request.url);
  login.searchParams.set("next", path);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: [
    {
      // Sign-in routes, Workflow's internal routes, and the routine-facing research API
      // (authenticated with its own bearer token) bypass the Google sign-in gate.
      source: "/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png|login|api/auth/|api/research/|.well-known/workflow/).*)",
    },
  ],
};
