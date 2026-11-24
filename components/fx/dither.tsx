"use client";

import { useEffect, useRef } from "react";

/**
 * Animated ordered dither (a React Bits-style effect, written for Hairpin): drifting gold waves thresholded through
 * a 4x4 Bayer matrix, drawn on a tiny canvas and scaled up with crisp pixels. Pointer-reactive when `interactive`.
 * Pauses when off screen or in a hidden tab; reduced motion draws a single still frame.
 */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

export function Dither({
  className = "",
  cell = 4,
  rgb = [201, 169, 110],
  strength = 0.9,
  speed = 1,
  interactive = false,
}: {
  className?: string;
  /** Size of one dither pixel on screen, in CSS px. */
  cell?: number;
  rgb?: [number, number, number];
  /** 0 to 1: how much of the area lights up. */
  strength?: number;
  speed?: number;
  interactive?: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let w = 0;
    let h = 0;
    let img: ImageData;
    let raf = 0;
    let visible = true;
    let last = 0;
    const pointer = { x: -1, y: -1, on: false };

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      w = Math.max(8, Math.min(320, Math.round(r.width / cell)));
      h = Math.max(8, Math.min(200, Math.round(r.height / cell)));
      canvas.width = w;
      canvas.height = h;
      img = ctx.createImageData(w, h);
    };

    const draw = (t: number) => {
      const d = img.data;
      const time = t * 0.0006 * speed;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const nx = x / w;
          const ny = y / h;
          let v = Math.sin(nx * 7 + time) + Math.sin(ny * 6 - time * 0.8) + Math.sin((nx + ny) * 5 + time * 0.6) + Math.sin(Math.hypot(nx - 0.7, ny - 0.3) * 11 - time * 1.4);
          v = (v + 4) / 8;
          if (pointer.on) {
            const dist = Math.hypot((nx - pointer.x) * (w / h), ny - pointer.y);
            v += Math.max(0, 0.45 - dist) * 1.2;
          }
          // Fade toward the bottom and the edges so the effect melts into the page.
          v *= 0.35 + 0.65 * (1 - ny);
          const on = v * strength > BAYER[(y & 3) * 4 + (x & 3)] + 0.28;
          const i = (y * w + x) * 4;
          d[i] = rgb[0];
          d[i + 1] = rgb[1];
          d[i + 2] = rgb[2];
          d[i + 3] = on ? 255 : 0;
        }
      }
      ctx.putImageData(img, 0, 0);
    };

    const frame = (t: number) => {
      raf = requestAnimationFrame(frame);
      if (!visible || document.hidden || t - last < 42) return; // about 24 fps
      last = t;
      draw(t);
    };

    resize();
    draw(2000);
    const ro = new ResizeObserver(() => {
      resize();
      draw(performance.now());
    });
    ro.observe(canvas);
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
    io.observe(canvas);
    if (!still) raf = requestAnimationFrame(frame);

    const parent = canvas.parentElement;
    const move = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      pointer.x = (e.clientX - r.left) / r.width;
      pointer.y = (e.clientY - r.top) / r.height;
      pointer.on = true;
    };
    const leave = () => (pointer.on = false);
    if (interactive && !still) {
      parent?.addEventListener("pointermove", move);
      parent?.addEventListener("pointerleave", leave);
    }
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      parent?.removeEventListener("pointermove", move);
      parent?.removeEventListener("pointerleave", leave);
    };
  }, [cell, rgb, strength, speed, interactive]);

  return <canvas ref={ref} aria-hidden className={`pointer-events-none absolute inset-0 size-full [image-rendering:pixelated] ${className}`} />;
}
