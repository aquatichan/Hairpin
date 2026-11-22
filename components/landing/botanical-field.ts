/**
 * Shared cursor-repulsion engine for decorative botanicals.
 *
 * One passive pointer listener, one requestAnimationFrame loop for every
 * registered decoration. Per frame it reads all anchor rects first, then writes
 * all transforms (no read/write interleaving). The loop sleeps whenever every
 * item is at rest and the pointer is still. Disabled for coarse pointers and
 * prefers-reduced-motion.
 */
type Item = {
  anchor: HTMLElement; // positioned wrapper, never transformed by us
  body: HTMLElement; // inner element that receives the transform
  max: number; // max displacement in px
  x: number;
  y: number;
  vx: number;
  vy: number;
  visible: boolean;
};

const items = new Set<Item>();
let px = -1e5;
let py = -1e5;
let raf = 0;
let started = false;
let enabled = false;
let io: IntersectionObserver | null = null;
const byEl = new WeakMap<Element, Item>();

const STIFFNESS = 0.055;
const DAMPING = 0.78; // < 1, tuned for no visible overshoot
const BASE_RADIUS = 220;

function start() {
  if (started || typeof window === "undefined") return;
  started = true;
  const fine = window.matchMedia("(hover: hover) and (pointer: fine)");
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  const update = () => {
    enabled = fine.matches && !reduce.matches;
    if (!enabled) {
      px = py = -1e5;
      kick();
    }
  };
  update();
  fine.addEventListener("change", update);
  reduce.addEventListener("change", update);
  window.addEventListener(
    "pointermove",
    (e) => {
      if (!enabled || e.pointerType !== "mouse") return;
      px = e.clientX;
      py = e.clientY;
      kick();
    },
    { passive: true },
  );
  document.documentElement.addEventListener("pointerleave", () => {
    px = py = -1e5;
    kick();
  });
  window.addEventListener("scroll", kick, { passive: true });
  io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const it = byEl.get(e.target);
        if (it) it.visible = e.isIntersecting;
      }
    },
    { rootMargin: "120px" },
  );
}

function kick() {
  if (!raf && items.size) raf = requestAnimationFrame(tick);
}

function tick() {
  raf = 0;
  const live: { it: Item; tx: number; ty: number }[] = [];
  // Read phase.
  for (const it of items) {
    if (!it.visible && it.x === 0 && it.y === 0) continue;
    let tx = 0;
    let ty = 0;
    if (enabled && it.visible) {
      const r = it.anchor.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const dx = cx - px;
      const dy = cy - py;
      const d = Math.hypot(dx, dy) || 1;
      const radius = BASE_RADIUS + Math.min(r.width, r.height) * 0.45;
      if (d < radius) {
        const f = (1 - d / radius) ** 2;
        tx = (dx / d) * f * it.max;
        ty = (dy / d) * f * it.max;
      }
    }
    live.push({ it, tx, ty });
  }
  // Write phase.
  let moving = false;
  for (const { it, tx, ty } of live) {
    it.vx = (it.vx + (tx - it.x) * STIFFNESS) * DAMPING;
    it.vy = (it.vy + (ty - it.y) * STIFFNESS) * DAMPING;
    it.x += it.vx;
    it.y += it.vy;
    if (Math.abs(it.vx) + Math.abs(it.vy) < 0.01 && Math.abs(tx - it.x) + Math.abs(ty - it.y) < 0.05) {
      it.x = tx;
      it.y = ty;
      it.vx = it.vy = 0;
    } else moving = true;
    it.body.style.transform = it.x || it.y ? `translate3d(${it.x.toFixed(2)}px, ${it.y.toFixed(2)}px, 0) rotate(${(it.x * 0.12).toFixed(2)}deg)` : "";
  }
  if (moving) kick();
}

export function registerBotanical(anchor: HTMLElement, body: HTMLElement, max: number) {
  start();
  const it: Item = { anchor, body, max, x: 0, y: 0, vx: 0, vy: 0, visible: false };
  items.add(it);
  byEl.set(anchor, it);
  io?.observe(anchor);
  return () => {
    items.delete(it);
    io?.unobserve(anchor);
    body.style.transform = "";
  };
}
