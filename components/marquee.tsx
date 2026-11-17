import type { Look } from "@/lib/looks";

/** Cut names shown as type while the library has no photos yet. Labels only, never stand-in pictures. */
const CUT_NAMES = [
  "Textured crop",
  "Curtain bangs",
  "Wolf cut",
  "Buzz fade",
  "Blunt bob",
  "Shag",
  "Taper",
  "French crop",
  "Butterfly layers",
  "Mullet",
  "Pixie",
  "Slick back",
];

type Props = {
  looks: Look[];
  /** Which slice of the library this row shows, so stacked rows differ. */
  offset?: number;
  reverse?: boolean;
  /** Seconds for one full loop. */
  duration?: number;
  /** Tile height as a Tailwind class, e.g. "h-32 lg:h-60". */
  height?: string;
  /** Colour of the type-only row shown before photos exist. */
  tone?: "ivory" | "champagne";
};

function rotate<T>(items: T[], by: number) {
  if (items.length === 0) return items;
  const n = by % items.length;
  return [...items.slice(n), ...items.slice(0, n)];
}

/**
 * An endless row of haircut photos and video loops. The content is rendered twice and the track slides by half its
 * width, so the loop has no seam. Pure CSS: it runs before hydration, pauses on hover, and holds still for reduced motion.
 */
export function Marquee({ looks, offset = 0, reverse = false, duration = 80, height = "h-32 sm:h-44 lg:h-60", tone = "ivory" }: Props) {
  const style = { "--marquee-duration": `${duration}s`, animationDirection: reverse ? "reverse" : "normal" } as React.CSSProperties;

  if (looks.length === 0) {
    const names = rotate(CUT_NAMES, offset);
    return (
      <div className="flex overflow-hidden" aria-hidden>
        <div data-marquee className="flex w-max shrink-0 animate-marquee hover:[animation-play-state:paused]" style={style}>
          {[0, 1].map((copy) => (
            <div key={copy} className="flex shrink-0 items-center">
              {names.map((name) => (
                <span key={name} className={`flex items-center font-serif text-display whitespace-nowrap ${tone === "champagne" ? "text-champagne" : "text-ivory"}`}>
                  <span className="px-6 lg:px-10">{name}</span>
                  <span className={`size-2 rounded-full ${tone === "champagne" ? "bg-ivory" : "bg-champagne"}`} />
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Repeat short libraries so one copy is always wider than the screen.
  const base = rotate(looks, offset);
  const row = base.length >= 8 ? base : Array.from({ length: Math.ceil(8 / base.length) }, () => base).flat();

  return (
    <div className="flex overflow-hidden" aria-hidden>
      <div data-marquee className="flex w-max shrink-0 animate-marquee hover:[animation-play-state:paused]" style={style}>
        {[0, 1].map((copy) => (
          <div key={copy} className="flex shrink-0 gap-3 pr-3">
            {row.map((look, i) => (
              <figure
                key={`${look.id}-${i}`}
                className={`relative shrink-0 overflow-hidden rounded-card bg-graphite ${height}`}
                style={{ aspectRatio: `1 / ${look.ratio}` }}
              >
                {look.video ? (
                  <video
                    src={look.video}
                    poster={look.image}
                    autoPlay
                    muted
                    loop
                    playsInline
                    preload="metadata"
                    className="size-full object-cover"
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element -- local, pre-sized photos; next/image adds nothing in a marquee
                  <img src={look.image} alt="" loading="lazy" decoding="async" className="size-full object-cover" />
                )}
                <figcaption className="absolute inset-x-0 bottom-0 bg-linear-to-t from-onyx/80 to-transparent truncate p-3 text-caption text-ivory">
                  {look.name}
                </figcaption>
              </figure>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
