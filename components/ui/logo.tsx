/** The Hairpin monogram: a Didone H with a hairpin threaded through its crossbar. */
export function LogoMark({ className = "size-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={`text-champagne ${className}`} aria-hidden>
      <g fill="currentColor">
        <rect x="23" y="18" width="10.5" height="64"/><rect x="66.5" y="18" width="10.5" height="64"/><rect x="17" y="17" width="22.5" height="1.8"/><rect x="17" y="81.2" width="22.5" height="1.8"/><rect x="60.5" y="17" width="22.5" height="1.8"/><rect x="60.5" y="81.2" width="22.5" height="1.8"/>
      </g>
      <path d="M86 46.5 H14 A3.5 3.5 0 0 0 14 53.5 Q19 50.6 24 53.5 T34 53.5 T44 53.5 T54 53.5 T64 53.5 T74 53.5 T84 53.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

/** Monogram plus the spaced HAIRPIN wordmark, for the hero and the nav rail. */
export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-3 text-champagne ${className}`} aria-label="Hairpin">
      <LogoMark className="size-9" />
      <span aria-hidden className="font-brand text-lead tracking-[0.3em]">
        HAIRPIN
      </span>
    </span>
  );
}
