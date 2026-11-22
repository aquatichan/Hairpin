"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { AssetSlot } from "./asset-slot";
import { TRANSFORMS } from "./assets";
import { Botanical } from "./botanical";
import { Reveal } from "./reveal";
import { StartButton } from "./start-button";

type Phase = "wire" | "scan" | "done";

const WIRE_MS = 950;
const SCAN_MS = 1500;

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

const STATUS: Record<Phase, string> = {
  wire: "Sending your photo",
  scan: "Applying the style",
  done: "Try-on preview ready",
};

/**
 * Pick one of ten portraits: a glowing golden wire carries it into the AI try-on frame,
 * a scan line sweeps down, and the face changes to the illustrative preview.
 */
export function Transformation() {
  const [pair, setPair] = useState(0);
  const [phase, setPhase] = useState<Phase>("done");
  const [pos, setPos] = useState(50);
  const [run, setRun] = useState(0);
  const [swapped, setSwapped] = useState(false);
  const [wire, setWire] = useState("");
  const vertical = useMedia("(max-width: 960px)");
  const reduced = useMedia("(prefers-reduced-motion: reduce)");

  const stage = useRef<HTMLDivElement>(null);
  const tray = useRef<HTMLDivElement>(null);
  const port = useRef<HTMLSpanElement>(null);
  const thumbs = useRef<(HTMLButtonElement | null)[]>([]);
  const timers = useRef<number[]>([]);
  const raf = useRef(0);
  const ditherFn = useRef<SVGFEFuncAElement>(null);

  const t = TRANSFORMS[pair];

  const clear = () => {
    timers.current.forEach((id) => window.clearTimeout(id));
    timers.current = [];
    cancelAnimationFrame(raf.current);
  };
  useEffect(() => clear, []);

  const tweenTo = useCallback((to: number, ms: number) => {
    const from = 0;
    const start = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - start) / ms);
      const e = 1 - Math.pow(1 - k, 3);
      setPos(Math.round(from + (to - from) * e));
      if (k < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
  }, []);

  // Black dither: noise thresholded by coverage c (0 clear .. 1 solid black).
  const setCover = useCallback((c: number) => {
    const fn = ditherFn.current;
    if (!fn) return;
    const th = c >= 0.985 ? -1 : c <= 0.015 ? 2 : 0.78 - c * 0.56;
    fn.setAttribute("intercept", String(-60 * th));
  }, []);

  const runDither = useCallback(() => {
    const start = performance.now();
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / SCAN_MS);
      const c = p < 0.45 ? p / 0.45 : 1 - (p - 0.45) / 0.55;
      setCover(Math.max(0, Math.min(1, c)));
      if (p < 1) raf.current = requestAnimationFrame(step);
      else setCover(0);
    };
    raf.current = requestAnimationFrame(step);
  }, [setCover]);

  const pick = (i: number) => {
    if (i === pair && phase !== "done") return;
    clear();
    setPair(i);
    setSwapped(false);
    setCover(0);
    setRun((n) => n + 1);
    if (reduced) {
      setPhase("done");
      setPos(50);
      return;
    }
    setPhase("wire");
    setPos(0);
    thumbs.current[i]?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
    timers.current.push(
      window.setTimeout(() => {
        setPhase("scan");
        runDither();
      }, WIRE_MS),
      window.setTimeout(() => setSwapped(true), WIRE_MS + SCAN_MS * 0.45),
      window.setTimeout(() => {
        setPhase("done");
        tweenTo(50, 700);
      }, WIRE_MS + SCAN_MS),
    );
  };

  // Route the wire from the chosen thumbnail to the frame's input port.
  const route = useCallback(() => {
    const s = stage.current?.getBoundingClientRect();
    const th = thumbs.current[pair]?.getBoundingClientRect();
    const pt = port.current?.getBoundingClientRect();
    if (!s || !th || !pt) return;
    const x2 = pt.left + pt.width / 2 - s.left;
    const y2 = pt.top + pt.height / 2 - s.top;
    if (vertical) {
      const x1 = th.left + th.width / 2 - s.left;
      const y1 = th.bottom - s.top;
      const d = Math.max(40, (y2 - y1) * 0.6);
      setWire(`M${x1} ${y1} C${x1} ${y1 + d} ${x2} ${y2 - d} ${x2} ${y2}`);
    } else {
      const x1 = th.right - s.left;
      const y1 = th.top + th.height / 2 - s.top;
      const d = Math.max(40, (x2 - x1) * 0.6);
      setWire(`M${x1} ${y1} C${x1 + d} ${y1} ${x2 - d} ${y2} ${x2} ${y2}`);
    }
  }, [pair, vertical]);

  useLayoutEffect(() => {
    route();
    const el = stage.current;
    if (!el) return;
    const ro = new ResizeObserver(route);
    ro.observe(el);
    const tr = tray.current;
    tr?.addEventListener("scroll", route, { passive: true });
    return () => {
      ro.disconnect();
      tr?.removeEventListener("scroll", route);
    };
  }, [route]);

  const live = phase !== "done";


  return (
    <section id="try-on" className="hp-transform" aria-labelledby="hp-transform-title">
      <Botanical assetId="botanical-peony-tl" className="hp-bot--try-bl" rotate={-100} strength={24} />
      <Botanical assetId="botanical-bloom-02" variant="bloom" className="hp-bot--try-tr" rotate={20} flip strength={20} />
      <Botanical assetId="botanical-peony-br" className="hp-bot--try-br" rotate={-20} flip strength={24} />
      <Botanical assetId="botanical-petal-04" variant="petal" className="hp-petal hp-petal--t2" rotate={50} strength={14} drift />
      <Botanical assetId="botanical-petal-02" variant="petal" className="hp-petal hp-petal--t1" rotate={35} strength={14} drift />
      <Reveal className="hp-transform__copy">
        <p className="hp-eyebrow">AI Try-On</p>
        <h2 id="hp-transform-title" className="hp-h2">
          See it on <em>you</em>
          <br />
          before the chair.
        </h2>
        <p className="hp-body">Pick a photo and watch it travel into the try-on. Upload your own to preview any reference on your face, hairline and texture.</p>
        <StartButton href="/try" label="Try a style" />
        <p className="hp-fineprint">Illustrative demonstration. Results vary with photo quality and hair type.</p>
      </Reveal>

      <svg width="0" height="0" className="hp-sr" aria-hidden focusable="false">
        <filter id="hp-dither" x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
          <feTurbulence type="fractalNoise" baseFrequency="0.55" numOctaves={1} seed={7} result="n" />
          <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1 0 0 0 0" />
          <feComponentTransfer>
            <feFuncA ref={ditherFn} type="linear" slope="60" intercept="-120" />
          </feComponentTransfer>
        </filter>
      </svg>
      <Reveal className="hp-stage" delay={120}>
        <div ref={stage} className="hp-stage__inner" data-phase={phase}>
          <div ref={tray} className="hp-tray" role="group" aria-label="Choose a portrait to try on">
            {TRANSFORMS.map((p, i) => (
              <button
                key={p.before.id}
                ref={(el) => {
                  thumbs.current[i] = el;
                }}
                type="button"
                className="hp-tray__btn"
                aria-pressed={i === pair}
                aria-label={`Portrait ${i + 1}`}
                onClick={() => pick(i)}
              >
                <AssetSlot asset={p.before} decorative silhouette={false} showTag={false} sizes="64px" />
              </button>
            ))}
          </div>

          <div className="hp-compare">
            <div className="hp-compare__frame" style={{ "--pos": `${pos}%` } as React.CSSProperties} data-phase={phase} data-swapped={swapped}>
              <AssetSlot key={t.before.id} asset={t.before} className="hp-compare__layer hp-compare__before" showTag={false} sizes="(max-width: 767px) 92vw, 36vw" />
              <div className="hp-compare__after" key={`${t.after.id}-${run}`}>
                <AssetSlot asset={t.after} className="hp-compare__layer" showTag={false} sizes="(max-width: 767px) 92vw, 36vw" />
              </div>
              <span className="hp-compare__dither" aria-hidden />
              <span className="hp-compare__line" aria-hidden>
                <span className="hp-compare__knob" />
              </span>
              <span className="hp-compare__tag hp-compare__tag--before" aria-hidden>
                Before
              </span>
              <span className="hp-compare__tag hp-compare__tag--after" aria-hidden>
                Try-on preview
              </span>
              <input
                type="range"
                min={0}
                max={100}
                value={pos}
                disabled={live}
                onChange={(e) => setPos(Number(e.target.value))}
                className="hp-compare__input"
                aria-label={`Compare before and try-on preview: ${t.label}`}
                aria-valuetext={`${pos}% try-on preview shown`}
              />
            </div>
            <span ref={port} className="hp-compare__port" data-phase={phase} aria-hidden />
            <p className="hp-compare__status" role="status" aria-live="polite">
              <span className="hp-compare__dot" data-phase={phase} aria-hidden />
              {STATUS[phase]}
              {phase === "done" && <em>{t.label}</em>}
            </p>
          </div>

          {wire && (
            <svg className="hp-wire" data-phase={phase} aria-hidden focusable="false">
              <g key={run}>
                <path d={wire} pathLength={1} className="hp-wire__glow" />
                <path d={wire} pathLength={1} className="hp-wire__core" />
                <path d={wire} pathLength={1} className="hp-wire__spark" />
              </g>
            </svg>
          )}
        </div>
      </Reveal>
    </section>
  );
}
