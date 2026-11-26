/**
 * App owners: the Google accounts in ADMIN_EMAILS (comma-separated) can read every workspace's
 * activity log. Nobody else can, whatever their domain.
 */
export function isAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  const admins = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return admins.includes(email.toLowerCase());
}
