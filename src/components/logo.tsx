/**
 * The Impersonator's mark: a studio microphone. The product is an interview with someone you
 * can't book. Same drawing as app/icon.svg.
 */
export function LogoMark({ size = 32, className = "" }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className={`shrink-0 ${className}`} aria-hidden="true">
      <rect width="64" height="64" rx="14" fill="#18181b" />
      <rect x="25" y="9" width="14" height="27" rx="7" fill="#10b981" />
      <path d="M25.5 17h13M25.5 22h13M25.5 27h13" stroke="#18181b" strokeWidth="1.6" opacity=".55" />
      <path d="M20 30v2c0 6.6 5.4 12 12 12s12-5.4 12-12v-2" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
      <path d="M32 44v8M24 53h16" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/** Mark plus the product name. */
export function Logo({ size = 28, className = "" }: { size?: number; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-semibold tracking-tight ${className}`}>
      <LogoMark size={size} />
      The Impersonator
    </span>
  );
}
