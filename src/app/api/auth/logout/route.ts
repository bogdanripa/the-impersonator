import { NextResponse } from "next/server";
import { SESSION_COOKIE, appOrigin } from "@/lib/auth";

export async function POST(request: Request) {
  const res = NextResponse.redirect(new URL("/login", appOrigin(request.url)), 303);
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
