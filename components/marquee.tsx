import type { Look } from "@/lib/looks";

type Props = {
  looks: Look[];
  /** Which slice of the library this row shows, so stacked rows differ. */
  offset?: number;
  reverse?: boolean;
  /** Seconds for one full loop. */
  duration?: number;
  /** Tile height as a Tailwind class, e.g. "h-40 lg:h-64". */
  height?: string;
};

/** Stand-in tiles while the library has no media: soft champagne light on graphite, never a fake photo. */
const GLOWS = [
  { ratio: 1.3, at: "30% 25%", tint: "champagne", mix: 60 },
  { ratio: 1, at: "70% 60%", tint: "ivory", mix: 20 },
  { ratio: 1.45, at: "50% 80%", tint: "champagne", mix: 45 },
  { ratio: 1.15, at: "20% 70%", tint: "stone", mix: 35 },
  { ratio: 1.35, at: "80% 20%", tint: "champagne", mix: 70 },
  { ratio: 0.9, at: "45% 40%", tint: "ivory", mix: 15 },
];

function rotate<T>(items: T[], by: number) {
  if (items.length === 0) return items;
  const n = by % items.length;
  return [...items.slice(n), ...items.slice(0, n)];
}

const tileClass = "relative shrink-0 overflow-hidden rounded-card bg-graphite ring-1 ring-ivory/5 transition-transform duration-500 ease-out hover:z-10 hover:scale-105";

/**
 * An endless row of haircut photos and video loops. The content is rendered twice and the track slides by half its
 * width, so the loop has no seam. Pure CSS: it runs before hydration, pauses on hover, and holds still for reduced motion.
 */
export function Marquee({ looks, offset = 0, reverse = false, duration = 80, height = "h-40 lg:h-64" }: Props) {
  const style = { "--marquee-duration": `${duration}s`, animationDirection: reverse ? "reverse" : "normal" } as React.CSSProperties;

  let tiles: React.ReactNode[];
  if (looks.length === 0) {
    tiles = rotate([...GLOWS, ...GLOWS], offset).map((g, i) => (
      <div key={i} className={`${tileClass} ${height}`} style={{ aspectRatio: `1 / ${g.ratio}` }}>
        <div
          className="absolute -inset-6 blur-xl"
          style={{ background: `radial-gradient(at ${g.at}, color-mix(in srgb, var(--color-${g.tint}) ${g.mix}%, transparent), transparent 70%)` }}
        />
      </div>
    ));
  } else {
    // Repeat short libraries so one copy is always wider than the screen.
    const base = rotate(looks, offset);
    const row = base.length >= 8 ? base : Array.from({ length: Math.ceil(8 / base.length) }, () => base).flat();
    tiles = row.map((look, i) => (
      <figure key={`${look.id}-${i}`} className={`group ${tileClass} ${height}`} style={{ aspectRatio: `1 / ${look.ratio}` }}>
        {look.video ? (
          <video src={look.video} poster={look.image} autoPlay muted loop playsInline preload="metadata" className="size-full object-cover" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- local, pre-sized photos; next/image adds nothing in a marquee
          <img src={look.image} alt="" loading="lazy" decoding="async" className="size-full object-cover" />
        )}
        <figcaption className="absolute inset-x-0 bottom-0 truncate bg-linear-to-t/oklch from-onyx/80 to-transparent p-3 text-caption text-ivory opacity-0 transition-opacity duration-300 group-hover:opacity-100">
          {look.name}
        </figcaption>
      </figure>
    ));
  }

  return (
    <div className="flex" aria-hidden>
      <div data-marquee className="flex w-max shrink-0 animate-marquee hover:[animation-play-state:paused]" style={style}>
        {[0, 1].map((copy) => (
          <div key={copy} className="flex shrink-0 gap-4 pr-4">
            {tiles}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Rows of marquees, tilted and running in opposite directions, faded at every edge. Fills its positioned parent.
 */
export function TiltedMarquee({ looks, rows = 5 }: { looks: Look[]; rows?: number }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden [mask-image:radial-gradient(ellipse_at_center,black_35%,transparent_75%)]">
      <div className="pointer-events-auto absolute top-1/2 left-1/2 flex w-[180%] -translate-x-1/2 -translate-y-1/2 -rotate-12 flex-col gap-4">
        {Array.from({ length: rows }, (_, i) => (
          <Marquee key={i} looks={looks} offset={i * 3} reverse={i % 2 === 1} duration={70 + i * 15} height="h-36 lg:h-56" />
        ))}
      </div>
    </div>
  );
}
