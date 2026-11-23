"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AssetSlot } from "./asset-slot";
import { LOOKS } from "./assets";
import { Botanical } from "./botanical";
import { ChevronLeft, ChevronRight, CloseIcon } from "./icons";
import { StartButton } from "./start-button";

type Look = (typeof LOOKS)[number];

function useMedia(query: string) {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

export function DiscoveryCarousel() {
  const mobile = useMedia("(max-width: 767px)");
  const reduced = useMedia("(prefers-reduced-motion: reduce)");
  const [holding, setHolding] = useState(false);
  const [active, setActive] = useState<Look | null>(null);
  const paused = holding || reduced || active !== null;

  return (
    <section id="discover" className="hp-discover" aria-labelledby="hp-discover-title">
      <h2 id="hp-discover-title" className="hp-sr">
        Hairstyle references
      </h2>
      {mobile ? (
        <MobileTrack looks={LOOKS} onOpen={setActive} />
      ) : (
        <div
          className="hp-band"
          onPointerEnter={(e) => e.pointerType === "mouse" && setHolding(true)}
          onPointerLeave={() => setHolding(false)}
          onFocus={() => setHolding(true)}
          onBlur={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setHolding(false)}
        >
          <Track label="Upper row" looks={LOOKS.slice(0, 6)} direction={-1} speed={24} paused={paused} onOpen={setActive} side="end" />
          <Track label="Lower row" looks={LOOKS.slice(6)} direction={1} speed={19} paused={paused} onOpen={setActive} side="start" />
        </div>
      )}
      <Botanical assetId="botanical-petal-01" variant="petal" className="hp-petal hp-petal--d1" rotate={25} strength={14} drift />
      <Botanical assetId="botanical-petal-05" variant="petal" className="hp-petal hp-petal--d2" rotate={-40} strength={14} drift />
      <Botanical assetId="botanical-petal-07" variant="petal" className="hp-petal hp-petal--d3" rotate={10} strength={14} drift />
      <Botanical assetId="botanical-petal-03" variant="petal" className="hp-petal hp-petal--d4" rotate={-15} strength={14} drift />
      <LookDialog look={active} onClose={() => setActive(null)} />
    </section>
  );
}

/* ---------- desktop track ---------- */

const COPIES = 3;
const FOCUSABLE_COPY = 1;

function Track({
  label,
  looks,
  direction,
  speed,
  paused,
  onOpen,
  side,
}: {
  label: string;
  looks: Look[];
  direction: 1 | -1;
  speed: number;
  paused: boolean;
  onOpen: (l: Look) => void;
  side: "start" | "end";
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const rail = useRef<HTMLDivElement>(null);
  const pausedRef = useRef(paused);
  const s = useRef({ offset: 0, target: null as number | null, setW: 0, step: 0, drag: null as null | { x: number; start: number; moved: boolean }, suppressClick: false });

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    const r = rail.current!;
    const st = s.current;
    const measure = () => {
      const first = r.firstElementChild as HTMLElement | null;
      const gap = parseFloat(getComputedStyle(r).columnGap) || 0;
      st.step = first ? first.offsetWidth + gap : 0;
      const prev = st.setW;
      st.setW = st.step * looks.length;
      if (!prev) st.offset = direction === 1 ? -st.setW * 0.85 : -st.setW * 0.35;
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(r);

    let visible = true;
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
    io.observe(r);

    let raf = 0;
    let last = performance.now();
    const wrap = () => {
      const w = st.setW;
      if (!w) return;
      let shift = 0;
      if (st.offset > -w * 0.25) shift = -w;
      else if (st.offset < -w * 1.75) shift = w;
      if (!shift) return;
      st.offset += shift;
      if (st.target !== null) st.target += shift;
      if (st.drag) st.drag.start += shift;
    };
    const frame = (t: number) => {
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      if (visible && !document.hidden && !st.drag) {
        if (st.target !== null) {
          st.offset += (st.target - st.offset) * 0.14;
          if (Math.abs(st.target - st.offset) < 0.5) {
            st.offset = st.target;
            st.target = null;
          }
        } else if (!pausedRef.current) {
          st.offset += direction * speed * dt;
        }
      }
      wrap();
      r.style.transform = `translate3d(${st.offset.toFixed(2)}px,0,0)`;
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
    };
  }, [direction, speed, looks.length]);

  const nudge = (n: number) => {
    const st = s.current;
    st.target = (st.target ?? st.offset) - n * st.step;
  };

  // Bring a keyboard-focused card fully into view.
  const onFocusCard = (e: React.FocusEvent<HTMLElement>) => {
    const vp = viewport.current;
    if (!vp) return;
    const c = e.currentTarget.getBoundingClientRect();
    const v = vp.getBoundingClientRect();
    const pad = 96;
    const st = s.current;
    if (c.left < v.left + pad) st.target = st.offset + (v.left + pad - c.left);
    else if (c.right > v.right - pad) st.target = st.offset - (c.right - (v.right - pad));
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    s.current.drag = { x: e.clientX, start: s.current.offset, moved: false };
    s.current.target = null;
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = s.current.drag;
    if (!d) return;
    const dx = e.clientX - d.x;
    if (!d.moved && Math.abs(dx) > 6) {
      d.moved = true;
      viewport.current?.setPointerCapture(e.pointerId);
    }
    if (d.moved) s.current.offset = d.start + dx;
  };
  const endDrag = () => {
    const d = s.current.drag;
    s.current.suppressClick = !!d?.moved;
    s.current.drag = null;
  };

  return (
    <div className={`hp-track hp-track--${side}`} role="group" aria-roledescription="carousel" aria-label={label}>
      <div
        ref={viewport}
        className="hp-track__viewport"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onClickCapture={(e) => {
          if (s.current.suppressClick) {
            e.preventDefault();
            e.stopPropagation();
            s.current.suppressClick = false;
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") nudge(1);
          if (e.key === "ArrowLeft") nudge(-1);
        }}
      >
        <div ref={rail} className="hp-track__rail">
          {Array.from({ length: COPIES }, (_, copy) =>
            looks.map((look, i) => (
              <Card
                key={`${copy}-${look.asset.id}`}
                look={look}
                index={i}
                total={looks.length}
                clone={copy !== FOCUSABLE_COPY}
                onOpen={onOpen}
                onFocus={onFocusCard}
              />
            )),
          )}
        </div>
      </div>
    </div>
  );
}

function Card({
  look,
  index,
  total,
  clone,
  onOpen,
  onFocus,
}: {
  look: Look;
  index: number;
  total: number;
  clone?: boolean;
  onOpen: (l: Look) => void;
  onFocus?: (e: React.FocusEvent<HTMLElement>) => void;
}) {
  const body = (
    <>
      <AssetSlot asset={look.asset} sizes="(max-width: 767px) 72vw, 280px" decorative={clone} />
      <span className="hp-card__caption">
        <span className="hp-card__name">{look.name}</span>
        <span className="hp-card__meta">
          {look.length} · {look.texture}
        </span>
      </span>
    </>
  );
  if (clone) {
    // Loop duplicates: visible, but never focusable or announced.
    return (
      <div className="hp-card" aria-hidden inert>
        {body}
      </div>
    );
  }
  return (
    <button
      type="button"
      className="hp-card"
      onClick={() => onOpen(look)}
      onFocus={onFocus}
      aria-label={`${look.name}, ${look.length.toLowerCase()} ${look.texture.toLowerCase()}. Reference ${index + 1} of ${total}. Open details`}
    >
      {body}
    </button>
  );
}

/* ---------- mobile: one native swipe track ---------- */

function MobileTrack({ looks, onOpen }: { looks: Look[]; onOpen: (l: Look) => void }) {
  const list = useRef<HTMLDivElement>(null);
  const scroll = (n: number) => {
    const el = list.current;
    const card = el?.firstElementChild as HTMLElement | null;
    if (el && card) el.scrollBy({ left: n * (card.offsetWidth + 14), behavior: "smooth" });
  };
  return (
    <div className="hp-mtrack" role="group" aria-roledescription="carousel" aria-label="Hairstyle references">
      <div ref={list} className="hp-mtrack__list">
        {looks.map((look, i) => (
          <Card key={look.asset.id} look={look} index={i} total={looks.length} onOpen={onOpen} />
        ))}
      </div>
      <div className="hp-mtrack__controls">
        <button type="button" className="hp-iconbtn" onClick={() => scroll(-1)} aria-label="Previous reference">
          <ChevronLeft />
        </button>
        <button type="button" className="hp-iconbtn" onClick={() => scroll(1)} aria-label="Next reference">
          <ChevronRight />
        </button>
      </div>
    </div>
  );
}

/* ---------- detail state ---------- */

function LookDialog({ look, onClose }: { look: Look | null; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (look && !d.open) d.showModal();
    if (!look && d.open) d.close();
  }, [look]);

  return (
    <dialog
      ref={ref}
      className="hp-dialog"
      aria-labelledby="hp-dialog-title"
      onClose={onClose}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      {look && (
        <div className="hp-dialog__inner">
          <AssetSlot asset={look.asset} className="hp-dialog__img" sizes="(max-width: 767px) 90vw, 420px" />
          <div className="hp-dialog__body">
            <p className="hp-eyebrow">
              {look.length} · {look.texture}
            </p>
            <h3 id="hp-dialog-title" className="hp-h3">
              {look.name}
            </h3>
            <p className="hp-body">Preview it on your own photo, save it to a board, or turn it into a Barber Brief to show whoever cuts your hair.</p>
            <StartButton href="/try" label="Try this look" />
          </div>
          <button type="button" className="hp-iconbtn hp-dialog__close" onClick={onClose} aria-label="Close">
            <CloseIcon />
          </button>
        </div>
      )}
    </dialog>
  );
}
