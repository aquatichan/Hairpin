"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { HeroCanvas } from "@/components/head/hero-canvas";

/** Still render of one hairstyle. Used by scripts/render-looks.mjs to make the preview catalog images. */
function Thumb() {
  const q = useSearchParams();
  return (
    <HeroCanvas framing="center" fixedStyle={Number(q.get("style") ?? 0)} fixedTurn={Number(q.get("turn") ?? 0)} fixedTime={Number(q.get("time") ?? 0)} />
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
