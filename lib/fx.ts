"use client";

/**
 * Small one-shot flourishes, all skipped when reduced motion is on:
 *  - lastPointer: where the last press happened, so dialogs grow out of it (origin awareness);
 *  - flyToSaved: a thumbnail flies along an arc into the Saved tab, which bumps (arcs, follow-through);
 *  - sparkle: a burst of gold dots around a control (secondary action);
 *  - petalBurst: gold petals that spring out and drift down (the peak of a try-on result).
 */
const still = () => typeof window === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches;

let last = { x: 0, y: 0, at: 0 };
export const rememberPointer = (x: number, y: number) => void (last = { x, y, at: performance.now() });
/** The last press within `withinMs`, or null (e.g. the dialog was opened from the keyboard). */
export const lastPointer = (withinMs = 1500) => (performance.now() - last.at < withinMs ? last : null);

/** Samples of a quadratic curve from a to b, bowed upward: a real arc, not a straight line. */
function arc(a: { x: number; y: number }, b: { x: number; y: number }, steps = 14) {
  const c = { x: (a.x + b.x) / 2, y: Math.min(a.y, b.y) - Math.max(120, Math.abs(a.x - b.x) * 0.35) };
  return Array.from({ length: steps + 1 }, (_, i) => {
    const t = i / steps;
    return { x: (1 - t) ** 2 * a.x + 2 * (1 - t) * t * c.x + t ** 2 * b.x, y: (1 - t) ** 2 * a.y + 2 * (1 - t) * t * c.y + t ** 2 * b.y, t };
  });
}

/** The visible Saved tab icon: the sidebar on desktop, the bottom bar on phones. */
function savedTarget(): HTMLElement | null {
  const all = [...document.querySelectorAll<HTMLElement>('[data-nav="/saved"]')];
  return all.find((el) => el.getBoundingClientRect().width > 0) ?? null;
}

export function flyToSaved(from: Element, imageSrc: string) {
  const target = savedTarget();
  if (!target) return;
  if (still()) return void target.classList.add("bump");
  const a = from.getBoundingClientRect();
  const b = target.getBoundingClientRect();
  const ghost = document.createElement("img");
  ghost.src = imageSrc;
  ghost.alt = "";
  ghost.setAttribute("aria-hidden", "true");
  const size = 56;
  Object.assign(ghost.style, {
    position: "fixed",
    left: "0",
    top: "0",
    width: `${size}px`,
    height: `${size * 1.33}px`,
    objectFit: "cover",
    borderRadius: "12px",
    border: "1px solid oklch(0.75 0.085 80)",
    boxShadow: "0 12px 30px oklch(0 0 0 / 0.5)",
    zIndex: "80",
    pointerEvents: "none",
  });
  document.body.appendChild(ghost);
  const start = { x: a.left + a.width / 2 - size / 2, y: a.top + a.height / 2 - size / 2 };
  const end = { x: b.left + b.width / 2 - size / 2, y: b.top + b.height / 2 - size / 2 };
  // Anticipation (a small dip), stretch while travelling, squash as it lands.
  const frames = arc(start, end).map(({ x, y, t }) => ({
    transform: `translate(${x}px, ${y + (t < 0.08 ? 10 * Math.sin((t / 0.08) * Math.PI) : 0)}px) rotate(${-14 * t}deg) scale(${(1 - 0.75 * t) * (t > 0.2 && t < 0.85 ? 1.06 : 1)}, ${(1 - 0.75 * t) * (t > 0.2 && t < 0.85 ? 0.94 : 1)})`,
    opacity: t > 0.92 ? 0 : 1,
    offset: t,
  }));
  const anim = ghost.animate(frames, { duration: 620, easing: "cubic-bezier(0.65, 0, 0.35, 1)" });
  anim.onfinish = anim.oncancel = () => {
    ghost.remove();
    target.classList.remove("bump");
    void target.offsetWidth;
    target.classList.add("bump");
    target.addEventListener("animationend", () => target.classList.remove("bump"), { once: true });
  };
}

export function sparkle(el: Element, count = 8) {
  if (still()) return;
  const r = el.getBoundingClientRect();
  for (let i = 0; i < count; i++) {
    const dot = document.createElement("span");
    const angle = (i / count) * Math.PI * 2 + Math.random() * 0.4;
    const dist = 18 + Math.random() * 14;
    Object.assign(dot.style, {
      position: "fixed",
      left: `${r.left + r.width / 2 - 2}px`,
      top: `${r.top + r.height / 2 - 2}px`,
      width: "4px",
      height: "4px",
      borderRadius: "9999px",
      background: "oklch(0.84 0.085 82)",
      zIndex: "80",
      pointerEvents: "none",
    });
    document.body.appendChild(dot);
    dot
      .animate(
        [
          { transform: "translate(0,0) scale(1)", opacity: 1 },
          { transform: `translate(${Math.cos(angle) * dist}px, ${Math.sin(angle) * dist}px) scale(0.3)`, opacity: 0 },
        ],
        { duration: 420 + Math.random() * 120, easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
      )
      .finished.finally(() => dot.remove());
  }
}

const PETALS = ["/assets/botanicals/botanical-petal-01.png", "/assets/botanicals/botanical-petal-03.png", "/assets/botanicals/botanical-petal-05.png"];

export function petalBurst(el: Element, count = 12) {
  if (still()) return;
  const r = el.getBoundingClientRect();
  for (let i = 0; i < count; i++) {
    const p = document.createElement("img");
    p.src = PETALS[i % PETALS.length];
    p.alt = "";
    p.setAttribute("aria-hidden", "true");
    const w = 18 + Math.random() * 16;
    Object.assign(p.style, { position: "fixed", left: `${r.left + r.width / 2}px`, top: `${r.top + r.height * 0.35}px`, width: `${w}px`, zIndex: "80", pointerEvents: "none" });
    document.body.appendChild(p);
    const dx = (Math.random() - 0.5) * r.width * 1.1;
    const up = 80 + Math.random() * 120;
    const spin = (Math.random() - 0.5) * 540;
    // Up and out on an arc, then a slow drift down: the details keep moving after the main reveal stops.
    p.animate(
      [
        { transform: "translate(0,0) rotate(0deg) scale(0.4)", opacity: 0 },
        { transform: `translate(${dx * 0.6}px, ${-up}px) rotate(${spin * 0.5}deg) scale(1)`, opacity: 1, offset: 0.35 },
        { transform: `translate(${dx}px, ${r.height * 0.5}px) rotate(${spin}deg) scale(0.9)`, opacity: 0 },
      ],
      { duration: 1500 + Math.random() * 700, delay: i * 30, easing: "cubic-bezier(0.33, 1, 0.68, 1)", fill: "both" },
    ).finished.finally(() => p.remove());
  }
}
