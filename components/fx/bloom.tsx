import Image from "next/image";

/** The gold botanicals from the landing page, as quiet decoration. Size and place them with className. */
const ART = {
  "peony-tl": { src: "/assets/botanicals/botanical-peony-tl.webp", w: 800, h: 763 },
  "peony-tr": { src: "/assets/botanicals/botanical-peony-tr.webp", w: 800, h: 611 },
  "peony-bl": { src: "/assets/botanicals/botanical-peony-bl.webp", w: 800, h: 624 },
  "peony-br": { src: "/assets/botanicals/botanical-peony-br.webp", w: 800, h: 624 },
  "bloom-1": { src: "/assets/botanicals/botanical-bloom-01.webp", w: 571, h: 537 },
  "bloom-2": { src: "/assets/botanicals/botanical-bloom-02.webp", w: 640, h: 440 },
  "bloom-3": { src: "/assets/botanicals/botanical-bloom-03.webp", w: 579, h: 468 },
  "bloom-4": { src: "/assets/botanicals/botanical-bloom-04.webp", w: 483, h: 461 },
  "petal-1": { src: "/assets/botanicals/botanical-petal-01.png", w: 187, h: 153 },
  "petal-3": { src: "/assets/botanicals/botanical-petal-03.png", w: 142, h: 116 },
  "petal-5": { src: "/assets/botanicals/botanical-petal-05.png", w: 145, h: 98 },
} as const;
export type BloomName = keyof typeof ART;

export function Bloom({
  name,
  className = "",
  rotate = 0,
  flip = false,
  float = true,
  delay = 0,
}: {
  name: BloomName;
  /** Position, size and opacity, e.g. "absolute -right-12 top-8 w-64 opacity-60". */
  className?: string;
  rotate?: number;
  flip?: boolean;
  float?: boolean;
  delay?: number;
}) {
  const a = ART[name];
  return (
    <span aria-hidden className={`bloom pointer-events-none ${float ? "bloom--float" : ""} ${className}`} style={{ animationDelay: `${delay}s` }}>
      <span className="block" style={{ transform: `rotate(${rotate}deg)${flip ? " scaleX(-1)" : ""}` }}>
        <Image src={a.src} alt="" width={a.w} height={a.h} sizes="(max-width: 768px) 40vw, 320px" className="h-auto w-full select-none" draggable={false} />
      </span>
    </span>
  );
}
