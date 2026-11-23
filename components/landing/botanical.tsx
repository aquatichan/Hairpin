"use client";

import { useEffect, useRef } from "react";
import { assetById } from "./assets";
import { registerBotanical } from "./botanical-field";

type Variant = "peony" | "bloom" | "bud" | "leaf" | "petal";

/**
 * A purely decorative gold botanical. Placeholder artwork is drawn in SVG; when
 * the transparent production PNG for `assetId` exists it replaces the drawing.
 * Position it with `className` (absolute, in a positioned parent).
 */
export function Botanical({
  assetId,
  variant = "peony",
  className = "",
  strength = 22,
  rotate = 0,
  flip = false,
  drift = false,
}: {
  assetId: string;
  variant?: Variant;
  className?: string;
  strength?: number;
  rotate?: number;
  flip?: boolean;
  drift?: boolean;
}) {
  // Every botanical swaps to its transparent cut-out once its manifest entry is integrated.
  const entry = assetById(assetId);
  const art = entry.ready ? entry : null;
  const anchor = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!anchor.current || !body.current) return;
    return registerBotanical(anchor.current, body.current, strength);
  }, [strength]);

  return (
    <div ref={anchor} className={`hp-botanical ${drift ? "hp-botanical--drift" : ""} ${className}`} data-asset-id={assetId} aria-hidden>
      <div ref={body} className="hp-botanical__body">
        <div className="hp-botanical__art" style={{ transform: `rotate(${rotate}deg)${flip ? " scaleX(-1)" : ""}` }}>
          {art ? (
            // eslint-disable-next-line @next/next/no-img-element -- decorative transparent PNG, sized by CSS
            <img src={art.path} alt="" className="hp-botanical__img" decoding="async" loading="lazy" draggable={false} />
          ) : (
            <BotanicalArt variant={variant} />
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------- placeholder artwork ---------- */

function petalPath(w: number, l: number) {
  return `M0 0C${-w} ${-l * 0.25} ${-w * 0.9} ${-l * 0.95} 0 ${-l}C${w * 0.9} ${-l * 0.95} ${w} ${-l * 0.25} 0 0Z`;
}

function Flower({ size = 1, rings = [9, 7, 5], open = 1 }: { size?: number; rings?: number[]; open?: number }) {
  return (
    <g transform={`scale(${size})`}>
      {rings.map((n, k) => {
        const l = (78 - k * 20) * open;
        const w = 34 - k * 7;
        return (
          <g key={k} opacity={0.62 + k * 0.14}>
            {Array.from({ length: n }, (_, i) => {
              const angle = (360 / n) * i + k * 17;
              return (
                <path
                  key={i}
                  d={petalPath(w, l)}
                  transform={`rotate(${angle})`}
                  fill="url(#hp-petal)"
                  stroke="#2a1d10"
                  strokeOpacity=".55"
                  strokeWidth=".8"
                />
              );
            })}
          </g>
        );
      })}
      {/* stamens */}
      {Array.from({ length: 14 }, (_, i) => {
        const t = (i / 14) * Math.PI * 2;
        const r = 9 + (i % 3) * 3;
        return <circle key={i} cx={+(Math.cos(t) * r).toFixed(1)} cy={+(Math.sin(t) * r).toFixed(1)} r="2.2" fill="#f4dfb2" />;
      })}
      <circle r="6" fill="#6b4d2c" />
    </g>
  );
}

function Leaf({ x, y, r, s = 1 }: { x: number; y: number; r: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${r}) scale(${s})`}>
      <path d="M0 0C18-14 52-16 80 0C52 16 18 14 0 0Z" fill="url(#hp-leaf)" opacity=".85" />
      <path d="M2 0H76" stroke="#f1d9a8" strokeOpacity=".5" strokeWidth=".8" />
    </g>
  );
}

function BotanicalArt({ variant }: { variant: Variant }) {
  if (variant === "petal") {
    return (
      <svg viewBox="-20 -44 40 48" className="hp-botanical__svg">
        <path d={petalPath(16, 40)} fill="url(#hp-petal)" opacity=".9" />
      </svg>
    );
  }
  if (variant === "leaf") {
    return (
      <svg viewBox="-4 -24 88 48" className="hp-botanical__svg">
        <Leaf x={0} y={0} r={0} />
      </svg>
    );
  }
  if (variant === "bud") {
    return (
      <svg viewBox="-60 -110 160 200" className="hp-botanical__svg">
        <path d="M0 80C4 30 10-10 6-60" stroke="#80603d" strokeWidth="2" fill="none" />
        <Leaf x={4} y={30} r={-30} s={0.7} />
        <g transform="translate(6 -70)">
          <Flower size={0.45} rings={[5, 4]} open={0.8} />
        </g>
      </svg>
    );
  }
  // peony / bloom: a main flower with stem, leaves and a secondary bud
  return (
    <svg viewBox="-200 -200 400 400" className="hp-botanical__svg">
      <path d="M-20 30C-60 90-110 130-190 170M10 20C60 70 110 90 180 100" stroke="#80603d" strokeWidth="2.4" fill="none" opacity=".8" />
      <Leaf x={-70} y={95} r={150} s={1.1} />
      <Leaf x={-120} y={128} r={200} s={0.8} />
      <Leaf x={70} y={68} r={20} s={1} />
      <Leaf x={130} y={92} r={-10} s={0.7} />
      {variant === "peony" && (
        <g transform="translate(130 -110)">
          <Flower size={0.42} rings={[7, 5]} />
        </g>
      )}
      <Flower size={variant === "peony" ? 1.25 : 1} />
    </svg>
  );
}
