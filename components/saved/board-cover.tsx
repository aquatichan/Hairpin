import Image from "next/image";
import type { Look } from "@/lib/looks";
import { LogoMark } from "../ui/logo";

/** A board's cover: its newest looks as a mosaic (1 to 4 portraits), or the monogram when it's empty. */
export function BoardCover({ looks, sizes = "(min-width: 1280px) 22vw, (min-width: 768px) 30vw, 45vw" }: { looks: Look[]; sizes?: string }) {
  const shown = looks.slice(0, 4);
  if (!shown.length) {
    return (
      <div className="grid size-full place-items-center bg-[radial-gradient(ellipse_at_50%_40%,color-mix(in_srgb,var(--color-champagne)_14%,transparent),transparent_70%)]">
        <LogoMark className="size-10 opacity-60" />
      </div>
    );
  }
  const layout =
    shown.length === 1
      ? "grid-cols-1"
      : shown.length === 2
        ? "grid-cols-2"
        : shown.length === 3
          ? "grid-cols-2 grid-rows-2 [&>*:first-child]:row-span-2"
          : "grid-cols-2 grid-rows-2";
  return (
    <div className={`grid size-full gap-0.5 ${layout}`}>
      {shown.map((l) => (
        <div key={l.id} className="relative min-h-0 overflow-hidden bg-slate">
          <Image src={l.image} alt="" fill sizes={sizes} className="object-cover" />
        </div>
      ))}
    </div>
  );
}
