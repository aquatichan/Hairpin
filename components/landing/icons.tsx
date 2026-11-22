const base = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.4,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

export const ArrowRight = ({ className = "hp-icon" }: { className?: string }) => (
  <svg {...base} className={className}>
    <path d="M4 12h15M13 6l6 6-6 6" />
  </svg>
);
export const ChevronLeft = () => (
  <svg {...base} className="hp-icon">
    <path d="M15 5l-7 7 7 7" />
  </svg>
);
export const ChevronRight = () => (
  <svg {...base} className="hp-icon">
    <path d="M9 5l7 7-7 7" />
  </svg>
);
export const PauseIcon = () => (
  <svg {...base} className="hp-icon">
    <path d="M9 6v12M15 6v12" />
  </svg>
);
export const PlayIcon = () => (
  <svg {...base} className="hp-icon">
    <path d="M8 5.5v13l10-6.5Z" />
  </svg>
);
export const CloseIcon = () => (
  <svg {...base} className="hp-icon">
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);
export const MenuIcon = () => (
  <svg {...base} className="hp-icon">
    <path d="M4 8h16M4 16h16" />
  </svg>
);
export const BookmarkIcon = () => (
  <svg {...base} className="hp-icon">
    <path d="M7 4h10v16l-5-3.5L7 20Z" />
  </svg>
);

/** Fine champagne arcs framing a composition. Pure decoration. */
export function GoldArcs({ className = "", variant = "hero" }: { className?: string; variant?: "hero" | "closing" }) {
  return (
    <svg className={`hp-arcs ${className}`} viewBox="0 0 1000 800" preserveAspectRatio="xMidYMid slice" aria-hidden focusable="false">
      {variant === "hero" ? (
        <>
          <circle cx="640" cy="330" r="300" fill="none" stroke="url(#hp-arc)" strokeWidth="3" opacity=".42" />
          <circle cx="640" cy="330" r="352" fill="none" stroke="url(#hp-arc)" strokeWidth="2" opacity=".24" />
          <path d="M120 820C300 560 620 470 1040 520" fill="none" stroke="url(#hp-arc)" strokeWidth="2.5" opacity=".34" />
        </>
      ) : (
        <>
          <path d="M-40 640C200 420 520 360 1040 440" fill="none" stroke="url(#hp-arc)" strokeWidth="3" opacity=".4" />
          <path d="M-40 700C260 500 600 470 1040 540" fill="none" stroke="url(#hp-arc)" strokeWidth="2" opacity=".24" />
        </>
      )}
    </svg>
  );
}

/** The Hairpin mark: two pillars joined by a wave. Takes its colour from the text colour. */
export function HairpinMark({ className = "" }: { className?: string }) {
  return (
    <svg className={`hp-mark ${className}`} viewBox="8 8 84 84" aria-hidden focusable="false">
      <g transform="translate(8 8) scale(0.84)" fill="currentColor">
        <rect x="23" y="18" width="10.5" height="64" />
        <rect x="66.5" y="18" width="10.5" height="64" />
        <rect x="17" y="17" width="22.5" height="1.8" />
        <rect x="17" y="81.2" width="22.5" height="1.8" />
        <rect x="60.5" y="17" width="22.5" height="1.8" />
        <rect x="60.5" y="81.2" width="22.5" height="1.8" />
        <path
          d="M86 46.5 H14 A3.5 3.5 0 0 0 14 53.5 Q19 50.6 24 53.5 T34 53.5 T44 53.5 T54 53.5 T64 53.5 T74 53.5 T84 53.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="4"
          strokeLinecap="round"
        />
      </g>
    </svg>
  );
}
