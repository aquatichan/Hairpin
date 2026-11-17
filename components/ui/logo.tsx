/** The Hairpin mark: a sculpted profile with clippers, drawn in champagne. Cut lines use the page background. */
export function LogoMark({ className = "size-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={`text-champagne ${className}`} aria-hidden>
      <g fill="currentColor"><path d="M45 21 L47.2 27.4 L46.6 29 L51.2 34.2 L47.4 35.8 L48.1 38.5 L46.9 39.5 L47.6 44.6 L45.6 47.2 L41 48.6 L40.4 58 L28.6 58 L29.2 47.5 L25.2 40.5 L24.2 32 Z"/><path d="M24.2 32 L23.8 23.5 L28.6 15 L36.4 10.2 L45.6 9 L54.6 12.6 L50 16.2 L45 21 L38.4 23.8 L35.6 31.4 Z"/><g transform="translate(6 27) rotate(-12 5 14)"><path d="M0 4 H10 L9 25 Q9 28 5 28 Q1 28 1 25 Z"/><path d="M-0.5 0 H10.5 V3 H-0.5 Z"/><path d="M0.5 -2.6 V-0.4 M3.1 -2.6 V-0.4 M5.7 -2.6 V-0.4 M8.3 -2.6 V-0.4" stroke="currentColor" strokeWidth="1.3"/><rect x="3.6" y="9" width="2.8" height="6" rx="1.4" fill="var(--color-onyx)"/></g></g><g stroke="var(--color-onyx)" strokeWidth="1" fill="none" strokeLinecap="round"><path d="M30.6 25.5 L42.6 12.6"/><path d="M36 22.6 L48.6 12.4"/><path d="M33.2 40 L41 48.6"/></g>
    </svg>
  );
}

/** Mark plus wordmark, for the hero and the nav rail. */
export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-serif text-title ${className}`}>
      <LogoMark />
      Hairpin
    </span>
  );
}
