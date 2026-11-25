import { NextResponse } from "next/server";
import { viewerOrg } from "@/lib/access";
import { isSharedOrg } from "@/lib/org";

/** Who is signed in, and the space they see: their company's (shared) or their own (private). */
export async function GET(request: Request) {
  const org = viewerOrg(request);
  return NextResponse.json({ email: request.headers.get("x-user-email"), org, shared: isSharedOrg(org) });
}
