import { useId } from "react";

/**
 * The Impersonator's mark: a mask ("persona" is Latin for mask) whose mouth is a quotation mark,
 * because everything a persona says comes from real quotes. Same drawing as app/icon.svg.
 */
export function LogoMark({ size = 32, className = "" }: { size?: number; className?: string }) {
  const g = `imp-${useId().replace(/:/g, "")}`;
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className={`shrink-0 ${className}`} aria-hidden="true">
      <defs>
        <linearGradient id={g} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#059669" />
          <stop offset="1" stopColor="#4f46e5" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="15" fill={`url(#${g})`} />
      <path d="M12 21c0-7 9-10.5 20-10.5S52 14 52 21v8.5C52 44 42.8 53 32 53S12 44 12 29.5z" fill="#fff" />
      <path d="M18 27c2-4 9-4.4 11.6-.2-2.7 3.6-9.3 3.7-11.6.2z" fill={`url(#${g})`} />
      <path d="M46 27c-2-4-9-4.4-11.6-.2 2.7 3.6 9.3 3.7 11.6.2z" fill={`url(#${g})`} />
      <g fill={`url(#${g})`}>
        <circle cx="27.6" cy="38.6" r="3.3" />
        <path d="M30.3 39.3c-.2 3.3-1.9 5.5-4.6 6.6l-.7-1.2c1.7-1 2.6-2.4 2.7-4.2z" />
        <circle cx="36.6" cy="38.6" r="3.3" />
        <path d="M39.3 39.3c-.2 3.3-1.9 5.5-4.6 6.6l-.7-1.2c1.7-1 2.6-2.4 2.7-4.2z" />
      </g>
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
