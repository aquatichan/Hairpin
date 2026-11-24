"use client";

import Image from "next/image";
import { useEffect, useState, useSyncExternalStore } from "react";
import { LogoMark } from "./logo";

/**
 * The Hairpin loading screen: the monogram glitching on a breakcore beat, gold blooms cutting in and out around it,
 * giant outlined wordmark rows racing behind, and a status line that decrypts itself.
 *
 * Accessibility: the visual layer is aria-hidden; screen readers get one plain status. Glitches are confined to small
 * areas and nothing flashes the whole screen (WCAG 2.3.1). Reduced motion gets a still composition.
 */

const GLYPHS = "HAIRPN✿❀✾/\\#%*+=<>01";
const BLOOMS = ["/assets/botanicals/botanical-bloom-01.webp", "/assets/botanicals/botanical-bloom-02.webp", "/assets/botanicals/botanical-bloom-03.webp"];
const PETALS = ["/assets/botanicals/botanical-petal-01.png", "/assets/botanicals/botanical-petal-03.png", "/assets/botanicals/botanical-petal-05.png"];

function subscribeMotion(cb: () => void) {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}
const useReducedMotion = () =>
  useSyncExternalStore(subscribeMotion, () => window.matchMedia("(prefers-reduced-motion: reduce)").matches, () => false);

function subscribeVisibility(cb: () => void) {
  document.addEventListener("visibilitychange", cb);
  return () => document.removeEventListener("visibilitychange", cb);
}
const useHidden = () => useSyncExternalStore(subscribeVisibility, () => document.hidden, () => false);

/** Decrypts `text` left to right through random glyphs, in the spirit of React Bits' DecryptedText. */
function useDecrypt(text: string, still: boolean, speed = 28) {
  const [shown, setShown] = useState(text);
  useEffect(() => {
    if (still) return;
    let frame = 0;
    const total = text.length + 6;
    const id = window.setInterval(() => {
      frame += 1;
      const settled = Math.max(0, frame - 6);
      setShown(
        text
          .split("")
          .map((ch, i) => (i < settled || ch === " " ? ch : GLYPHS[Math.floor(Math.random() * GLYPHS.length)]))
          .join(""),
      );
      if (frame >= total) window.clearInterval(id);
    }, speed);
    return () => window.clearInterval(id);
  }, [text, still, speed]);
  return still ? text : shown;
}

/** Cycles through `steps`, holding on the last one. */
function useStep(steps: string[] | undefined, every: number) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (!steps || steps.length < 2) return;
    const id = window.setInterval(() => setI((n) => Math.min(n + 1, steps.length - 1)), every);
    return () => window.clearInterval(id);
  }, [steps, every]);
  return steps?.[i];
}

export function HairpinLoader({
  label = "Loading",
  steps,
  stepEvery = 4200,
  variant = "screen",
  className = "",
}: {
  /** What screen readers hear; also the visible status when there are no steps. */
  label?: string;
  /** Visible status lines, shown in turn (e.g. the stages of a render). */
  steps?: string[];
  stepEvery?: number;
  /** screen: fills the viewport. panel: fills its positioned parent. */
  variant?: "screen" | "panel";
  className?: string;
}) {
  const reduced = useReducedMotion();
  const hidden = useHidden();
  const still = reduced || hidden;
  const status = useStep(steps, stepEvery) ?? label;
  const shownStatus = useDecrypt(status.toUpperCase(), still);
  const word = useDecrypt("HAIRPIN", still, 45);

  return (
    <div role="status" aria-live="polite" className={`hl hl--${variant} ${reduced ? "hl--still" : ""} ${hidden ? "hl--paused" : ""} ${className}`}>
      <span className="sr-only">{status}</span>

      <div className="hl-type" aria-hidden>
        {[0, 1, 2, 3].map((row) => (
          <div key={row} className={`hl-type__row hl-type__row--${row}`}>
            <span>HAIRPIN ✿ HAIRPIN ✿ HAIRPIN ✿ HAIRPIN ✿ HAIRPIN ✿ HAIRPIN ✿&nbsp;</span>
            <span>HAIRPIN ✿ HAIRPIN ✿ HAIRPIN ✿ HAIRPIN ✿ HAIRPIN ✿ HAIRPIN ✿&nbsp;</span>
          </div>
        ))}
      </div>

      <div className="hl-stage" aria-hidden>
        {BLOOMS.map((src, i) => (
          <span key={src} className={`hl-bloom hl-bloom--${i}`}>
            <Image src={src} alt="" width={160} height={150} sizes="160px" priority={variant === "screen" && i === 0} />
          </span>
        ))}
        {PETALS.map((src, i) => (
          <span key={src} className={`hl-petal hl-petal--${i}`}>
            <Image src={src} alt="" width={48} height={40} sizes="48px" />
          </span>
        ))}

        <div className="hl-core">
          <span className="hl-ring" />
          <span className="hl-mark">
            <LogoMark className="hl-mark__layer hl-mark__layer--r" />
            <LogoMark className="hl-mark__layer hl-mark__layer--c" />
            <LogoMark className="hl-mark__layer hl-mark__layer--main" />
          </span>
        </div>

        <p className="hl-word">{word}</p>
        <p className="hl-status">
          <span className="hl-status__bars">
            <i />
            <i />
            <i />
            <i />
          </span>
          {shownStatus}
        </p>
      </div>

      <span className="hl-scan" aria-hidden />
    </div>
  );
}
