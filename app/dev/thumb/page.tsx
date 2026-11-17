"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { HeroCanvas } from "@/components/head/hero-canvas";
import { palettes, type PaletteName } from "@/components/head/palettes";

/** Still render of one hairstyle and palette, for design reviews: /dev/thumb?style=2&palette=champagne */
function Thumb() {
  const q = useSearchParams();
  const p = q.get("palette");
  const palette = p && p in palettes ? (p as PaletteName) : undefined;
  return (
    <HeroCanvas framing="center" fixedStyle={Number(q.get("style") ?? 0)} fixedTurn={Number(q.get("turn") ?? 0)} fixedTime={Number(q.get("time") ?? 0)} palette={palette} />
  );
}

export default function Page() {
  return (
    <main className="relative h-dvh w-full bg-onyx">
      <Suspense>
        <Thumb />
      </Suspense>
    </main>
  );
}
