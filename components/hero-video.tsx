"use client";

import { useState } from "react";

/**
 * Full-bleed background loop from public/hero/hero.mp4, darkened and warmed toward champagne. Until that file exists
 * (or if it fails), slow-drifting champagne light shows instead, so the hero never looks empty.
 */
export function HeroVideo() {
  const [ready, setReady] = useState(false);
  return (
    <div className="absolute inset-0 overflow-hidden" aria-hidden>
      <div data-marquee className="absolute -inset-1/4 animate-drift bg-radial-[at_25%_30%] from-champagne/25 via-transparent to-transparent blur-3xl" />
      <div data-marquee className="absolute -inset-1/4 animate-drift bg-radial-[at_75%_70%] from-stone/20 via-transparent to-transparent blur-3xl [animation-direction:reverse]" />
      <video
        src="/hero/hero.mp4"
        poster="/hero/poster.jpg"
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        onLoadedData={() => setReady(true)}
        className={`absolute inset-0 size-full object-cover grayscale-[40%] transition-opacity duration-1000 ease-out ${ready ? "opacity-100" : "opacity-0"}`}
      />
      <div className="absolute inset-0 bg-onyx/70" />
      <div className="absolute inset-0 bg-champagne/10 mix-blend-color" />
    </div>
  );
}
