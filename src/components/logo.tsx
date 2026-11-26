import { useId } from "react";

/**
 * The Impersonator's mark: a smiling speech bubble whose eyes are quotation marks, because
 * everything a persona says comes from real quotes. Same drawing as app/icon.svg.
 */
export function LogoMark({ size = 32, className = "" }: { size?: number; className?: string }) {
  const g = `imp-${useId().replace(/:/g, "")}`;
  const fill = `url(#${g})`;
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className={`shrink-0 ${className}`} aria-hidden="true">
      <defs>
        <linearGradient id={g} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#10b981" />
          <stop offset="1" stopColor="#6366f1" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="15" fill={fill} />
      <path
        d="M32 11c11.6 0 21 8.3 21 18.6S43.6 48.2 32 48.2c-2.3 0-4.5-.3-6.6-.9L16 53l2.6-8.6C14 41 11 35.6 11 29.6 11 19.3 20.4 11 32 11z"
        fill="#fff"
      />
      <g fill={fill}>
        <circle cx="24" cy="25.5" r="3.4" />
        <path d="M26.8 26.2c-.2 3.3-1.9 5.4-4.6 6.5l-.7-1.2c1.7-1 2.6-2.3 2.7-4.1z" />
        <circle cx="40" cy="25.5" r="3.4" />
        <path d="M42.8 26.2c-.2 3.3-1.9 5.4-4.6 6.5l-.7-1.2c1.7-1 2.6-2.3 2.7-4.1z" />
      </g>
      <path d="M24.5 37c2 2.8 4.6 4.1 7.5 4.1s5.5-1.3 7.5-4.1" fill="none" stroke={fill} strokeWidth="3.2" strokeLinecap="round" />
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
