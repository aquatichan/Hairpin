"use client";

import { useEffect } from "react";
import { rememberPointer } from "@/lib/fx";

/**
 * One set of document listeners for the whole app:
 *  - every press is remembered, so dialogs can grow out of it;
 *  - a press on a `.ripple-host` ripples out from the exact point pressed;
 *  - a mouse over a `[data-tilt]` element tilts it toward the pointer and moves its highlight.
 * Nothing runs for reduced motion except remembering the pointer.
 */
export function MotionLayer() {
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const down = (e: PointerEvent) => {
      rememberPointer(e.clientX, e.clientY);
      if (reduced) return;
      const host = (e.target as Element | null)?.closest?.(".ripple-host") as HTMLElement | null;
      if (!host || (host as HTMLButtonElement).disabled) return;
      const r = host.getBoundingClientRect();
      const dot = document.createElement("span");
      dot.className = "ripple";
      dot.style.left = `${e.clientX - r.left}px`;
      dot.style.top = `${e.clientY - r.top}px`;
      dot.style.setProperty("--ripple-scale", String(Math.ceil((Math.hypot(r.width, r.height) * 2) / 12)));
      host.appendChild(dot);
      dot.addEventListener("animationend", () => dot.remove(), { once: true });
    };

    let tilted: HTMLElement | null = null;
    const reset = (el: HTMLElement) => {
      el.style.setProperty("--rx", "0deg");
      el.style.setProperty("--ry", "0deg");
      el.style.setProperty("--shine", "0");
    };
    const move = (e: PointerEvent) => {
      if (reduced || e.pointerType !== "mouse") return;
      const el = (e.target as Element | null)?.closest?.("[data-tilt]") as HTMLElement | null;
      if (tilted && tilted !== el) reset(tilted);
      tilted = el;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width;
      const py = (e.clientY - r.top) / r.height;
      const max = Number(el.dataset.tilt) || 5;
      el.style.setProperty("--ry", `${(px - 0.5) * max * 2}deg`);
      el.style.setProperty("--rx", `${(0.5 - py) * max * 2}deg`);
      el.style.setProperty("--mx", `${px * 100}%`);
      el.style.setProperty("--my", `${py * 100}%`);
      el.style.setProperty("--shine", "1");
    };
    const leave = () => {
      if (tilted) reset(tilted);
      tilted = null;
    };

    document.addEventListener("pointerdown", down, { passive: true, capture: true });
    document.addEventListener("pointermove", move, { passive: true });
    document.addEventListener("pointerleave", leave);
    return () => {
      document.removeEventListener("pointerdown", down, { capture: true });
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerleave", leave);
    };
  }, []);
  return null;
}
