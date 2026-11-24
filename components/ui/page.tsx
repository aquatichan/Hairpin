import { Bloom, type BloomName } from "../fx/bloom";
import { Dither } from "../fx/dither";
import { Grainient, type GrainientTone } from "../fx/grainient";

export type Backdrop = { tone?: GrainientTone; dither?: boolean; blooms?: { name: BloomName; className: string; rotate?: number; flip?: boolean; delay?: number }[] };

/**
 * The one page wrapper for every signed-in screen: a wide desktop-first column, the same gutters and vertical rhythm
 * everywhere, and a decorative band behind the top of the page (gradient and grain, optional dither, a few blooms).
 * The band is clipped to the page and never takes pointer events.
 */
export function Page({ children, backdrop, className = "", width = "wide" }: { children: React.ReactNode; backdrop?: Backdrop; className?: string; width?: "wide" | "reading" }) {
  return (
    <div className="relative isolate overflow-x-clip">
      {backdrop && (
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[34rem] overflow-hidden">
          <div className="backdrop-fade absolute inset-0">
            <Grainient tone={backdrop.tone ?? "gold"} />
            {backdrop.dither && <Dither className="opacity-[0.13]" cell={5} strength={0.8} />}
          </div>
          {backdrop.blooms?.map((b, i) => (
            <Bloom key={i} {...b} className={`page-bloom absolute ${b.className}`} />
          ))}
        </div>
      )}
      <div
        className={`mx-auto flex w-full flex-col gap-8 px-4 py-6 md:px-8 lg:py-12 xl:px-12 ${width === "wide" ? "max-w-[1680px]" : "max-w-5xl"} ${className}`}
      >
        {children}
      </div>
    </div>
  );
}
