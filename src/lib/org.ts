/**
 * Who shares what. Everyone signed in with a Google Workspace account shares one space per company
 * domain (Google's `hd` claim): its personas and their conversations. A personal account (Gmail and
 * the like, no `hd`) gets a private space of its own, keyed by the email address.
 *
 * ORG_DOMAIN_ALIASES merges domains that belong to one company, e.g. "genez.io=genezio.com".
 */
function aliases(): Map<string, string> {
  return new Map(
    (process.env.ORG_DOMAIN_ALIASES ?? "")
      .split(",")
      .map((pair) => pair.split("=").map((s) => s.trim().toLowerCase()))
      .filter((p): p is [string, string] => p.length === 2 && !!p[0] && !!p[1]),
  );
}

export function orgForDomain(domain: string): string {
  const d = domain.toLowerCase();
  return aliases().get(d) ?? d;
}

/** The space for a signed-in Google account: its Workspace domain, or the address itself. */
export function orgFor(email: string, hostedDomain?: string | null): string {
  return hostedDomain ? orgForDomain(hostedDomain) : email.toLowerCase();
}

/** True when the space is one company's (shared), false for a personal account's private space. */
export function isSharedOrg(org: string): boolean {
  return !org.includes("@");
}
