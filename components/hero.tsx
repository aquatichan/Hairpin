"use client";

import { useState } from "react";
import { HeroCanvas } from "./head/hero-canvas";
import { hairStyles } from "./head/styles";
import { SignIn } from "./sign-in";
import { RevealText } from "./ui/reveal-text";

export function Hero() {
  const [style, setStyle] = useState(0);
  const current = hairStyles[style];
  return (
    <main className="relative flex min-h-dvh flex-1 touch-none flex-col overflow-hidden bg-onyx select-none">
      <HeroCanvas framing="hero" onStyle={setStyle} />
      <div className="absolute inset-x-0 bottom-0 h-1/2 bg-linear-to-t from-onyx to-transparent lg:hidden" aria-hidden />
      <div className="pointer-events-none relative flex flex-1 flex-col justify-between p-6 lg:p-12">
        <div className="flex items-start justify-between">
          <p className="animate-fade font-serif text-title">Hairpin</p>
          <p className="animate-fade text-right text-caption text-stone" aria-live="off">
            <span className="tracking-widest uppercase">Now wearing</span>
            <span key={current.id} className="block animate-rise font-serif text-title text-ivory">
              {current.name}
            </span>
          </p>
        </div>
        <div className="pointer-events-auto flex max-w-xl flex-col items-start gap-6">
          <h1 className="font-serif text-display text-balance">
            <RevealText text="Try any cut on you before you sit in the chair." delay={150} />
          </h1>
          <div className="animate-rise" style={{ animationDelay: "900ms" }}>
            <SignIn />
          </div>
          <p className="animate-fade text-caption text-stone lg:hidden" style={{ animationDelay: "1400ms" }}>
            Drag to turn. Tilt your phone to look around.
          </p>
          <p className="hidden animate-fade text-caption text-stone lg:block" style={{ animationDelay: "1400ms" }}>
            Drag to turn the head.
          </p>
        </div>
      </div>
    </main>
  );
}
