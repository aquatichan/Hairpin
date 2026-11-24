"use client";

import { useEffect, useRef } from "react";

/**
 * A card that bursts into gold pixels from its corners when hovered or focused (after React Bits' "Pixel Card").
 * Draws only while the effect is playing. Wraps its children; decorative only.
 */
export function PixelSurface({ children, className = "", gap = 10, as: Tag = "div" }: { children: React.ReactNode; className?: string; gap?: number; as?: "div" | "span" }) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = box.current;
    const cv = canvas.current;
    const ctx = cv?.getContext("2d");
    if (!el || !cv || !ctx || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    type P = { x: number; y: number; size: number; at: number; life: number; dist: number };
    let pixels: P[] = [];
    let raf = 0;
    let start = 0;
    let dir: 1 | -1 = 1;
    let w = 0;
    let h = 0;

    const build = () => {
      const r = el.getBoundingClientRect();
      w = cv.width = Math.round(r.width);
      h = cv.height = Math.round(r.height);
      pixels = [];
      const max = Math.hypot(w, h);
      for (let x = 0; x < w; x += gap) {
        for (let y = 0; y < h; y += gap) {
          // Closest to a corner appears first, with some jitter.
          const dc = Math.min(Math.hypot(x, y), Math.hypot(w - x, y), Math.hypot(x, h - y), Math.hypot(w - x, h - y));
          pixels.push({ x, y, size: 0, at: (dc / max) * 520 + Math.random() * 160, life: 240 + Math.random() * 240, dist: dc });
        }
      }
    };

    const tick = (now: number) => {
      const t = now - start;
      ctx.clearRect(0, 0, w, h);
      let alive = false;
      for (const p of pixels) {
        const local = dir === 1 ? t - p.at : 700 - t - p.at;
        if (local < 0 || local > p.life * 1.6) {
          if (dir === 1 && local < 0) alive = true;
          continue;
        }
        alive = true;
        const k = Math.min(1, local / p.life);
        const s = Math.sin(k * Math.PI) * gap * 0.62;
        ctx.fillStyle = `rgba(228,197,141,${0.1 + Math.sin(k * Math.PI) * 0.5})`;
        ctx.fillRect(p.x + (gap - s) / 2, p.y + (gap - s) / 2, s, s);
      }
      if (alive && t < 1500) raf = requestAnimationFrame(tick);
      else ctx.clearRect(0, 0, w, h);
    };

    const play = (d: 1 | -1) => {
      cancelAnimationFrame(raf);
      dir = d;
      if (d === 1) build();
      start = performance.now();
      raf = requestAnimationFrame(tick);
    };
    const on = () => play(1);
    el.addEventListener("pointerenter", on);
    el.addEventListener("focusin", on);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("pointerenter", on);
      el.removeEventListener("focusin", on);
    };
  }, [gap]);

  return (
    <Tag ref={box as never} className={`relative ${className}`}>
      {children}
      <canvas ref={canvas} aria-hidden className="pointer-events-none absolute inset-0 size-full rounded-[inherit]" />
    </Tag>
  );
}
