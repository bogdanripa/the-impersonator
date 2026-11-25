import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, readSession } from "@/lib/auth";

/** Google sign-in gate. Passes who the viewer is, and which space they belong to, to the routes. */
export async function proxy(request: NextRequest) {
  const session = await readSession(request.cookies.get(SESSION_COOKIE)?.value);
  if (session) {
    const headers = new Headers(request.headers);
    headers.set("x-user-email", session.email);
    headers.set("x-user-org", session.org);
    return NextResponse.next({ request: { headers } });
  }
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const login = new URL("/login", request.url);
  login.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: [
    {
      // Sign-in routes, Workflow's internal routes, and the routine-facing research API
      // (authenticated with its own bearer token) bypass the Google sign-in gate.
      source: "/((?!_next/static|_next/image|favicon.ico|login|api/auth/|api/research/|.well-known/workflow/).*)",
    },
  ],
};
