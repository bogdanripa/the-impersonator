import { NextResponse } from "next/server";
import { viewerOrg } from "@/lib/access";
import { isSharedOrg } from "@/lib/org";
import { isAdmin } from "@/lib/admin";

/** Who is signed in, and the space they see: their company's (shared) or their own (private). */
export async function GET(request: Request) {
  const org = viewerOrg(request);
  const email = request.headers.get("x-user-email");
  return NextResponse.json({ email, org, shared: isSharedOrg(org), admin: isAdmin(email) });
}
