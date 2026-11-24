"use client";

import { useEffect, useRef, useState } from "react";
import { detectFace } from "@/lib/face-detect";
import { FACE_OVAL, LM, classifyFace, describeResult, type FaceResult } from "@/lib/face-shape";
import { FACE_SHAPE_DISCLAIMER, FACE_SHAPE_GUIDE } from "@/lib/face-shape-guide";
import { resizeToJpeg } from "@/lib/image";
import { localStore } from "@/lib/local-store";
import { saveProfile, useProfile } from "@/lib/profile";
import { FACE_SHAPES, type FaceShape } from "@/lib/style";
import { useLocal } from "@/lib/use-local";
import { Button, buttonClass } from "../ui/button";
import { Chip } from "../ui/chip";
import { HairpinLoader } from "../ui/hairpin-loader";
import { Notice } from "../ui/notice";

type Point = { x: number; y: number };
type Shown = { bitmap: ImageBitmap; face: Point[]; width: number; height: number; result: Extract<FaceResult, { ok: true }> };
type State = { stage: "idle" } | { stage: "busy"; first: boolean } | { stage: "done"; shown: Shown } | { stage: "fail"; message: string; retry: boolean };

const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Draws the photo, then the face-shape overlay up to `t` (0..1): the oval first, then the four measurement lines. */
function paint(canvas: HTMLCanvasElement, s: Shown, t: number) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const { width: w, height: h, face } = s;
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(s.bitmap, 0, 0, w, h);
  const at = (i: number) => ({ x: face[i].x * w, y: face[i].y * h });
  const unit = Math.max(w, h) / 600;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.shadowColor = "rgba(0,0,0,0.6)";
  ctx.shadowBlur = 6 * unit;

  // 1. Oval contour, traced.
  const ovalT = Math.min(1, t / 0.55);
  const pts = FACE_OVAL.map(at);
  const n = Math.max(2, Math.floor(pts.length * ovalT) + 1);
  ctx.strokeStyle = "#e6c88e";
  ctx.lineWidth = 2.5 * unit;
  ctx.beginPath();
  pts.slice(0, n).forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  if (ovalT >= 1) ctx.closePath();
  ctx.stroke();

  // 2. The four measurements, one after another.
  const lines: [number, number, string][] = [
    [LM.top, LM.chin, "length"],
    [LM.cheekR, LM.cheekL, "cheekbones"],
    [LM.templeR, LM.templeL, "forehead"],
    [LM.gonionR, LM.gonionL, "jaw"],
  ];
  ctx.font = `${12 * unit}px ui-monospace, Menlo, monospace`;
  lines.forEach(([a, b, label], i) => {
    const start = 0.5 + i * 0.12;
    const p = Math.max(0, Math.min(1, (t - start) / 0.14));
    if (p <= 0) return;
    const A = at(a), B = at(b);
    const X = A.x + (B.x - A.x) * p, Y = A.y + (B.y - A.y) * p;
    ctx.strokeStyle = "rgba(244,239,230,0.9)";
    ctx.lineWidth = 1.5 * unit;
    ctx.setLineDash([5 * unit, 4 * unit]);
    ctx.beginPath();
    ctx.moveTo(A.x, A.y);
    ctx.lineTo(X, Y);
    ctx.stroke();
    ctx.setLineDash([]);
    for (const q of p >= 1 ? [A, B] : [A]) {
      ctx.fillStyle = "#e6c88e";
      ctx.beginPath();
      ctx.arc(q.x, q.y, 3.5 * unit, 0, Math.PI * 2);
      ctx.fill();
    }
    if (p >= 1) {
      ctx.fillStyle = "rgba(244,239,230,0.95)";
      const horizontal = Math.abs(B.x - A.x) > Math.abs(B.y - A.y);
      ctx.fillText(label, horizontal ? Math.max(4, Math.min(A.x, B.x)) : A.x + 8 * unit, horizontal ? A.y - 7 * unit : (A.y + B.y) / 2);
    }
  });
}

function Overlay({ shown }: { shown: Shown }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    if (reduced()) return void paint(c, shown, 1);
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 2200);
      paint(c, shown, t);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [shown]);
  return <canvas ref={ref} width={shown.width} height={shown.height} role="img" aria-label="Your photo with your face outline and measurements drawn on it" className="block max-h-[28rem] w-full rounded-card bg-graphite object-contain" />;
}

/** What stylists often suggest for the chosen shape. Positive wording only. */
export function FaceShapeGuideCard({ shape }: { shape: FaceShape }) {
  const g = FACE_SHAPE_GUIDE[shape];
  return (
    <div className="surface-raised flex flex-col gap-2 rounded-[var(--r-tile)] p-4">
      <p className="text-caption tracking-widest text-champagne uppercase">
        {g.name}
        {g.versatile && " · versatile"}
      </p>
      <p className="text-body text-stone">{g.shape}</p>
      <ul className="list-disc pl-5 text-body text-ivory/90">
        {g.ideas.map((i) => (
          <li key={i}>{i}</li>
        ))}
      </ul>
      <p className="text-caption text-stone">{FACE_SHAPE_DISCLAIMER}</p>
    </div>
  );
}

/**
 * "My face": scans a photo on this device with MediaPipe, draws the outline and measurements on it, and suggests a
 * face shape the person confirms or changes. Only the shape is saved, never the photo or the landmarks.
 */
export function FaceScan({ onSaved }: { onSaved?: (shape: FaceShape) => void }) {
  const profile = useProfile();
  const saved = useLocal(() => localStore.get("photo", "active").then((p) => p ?? null), "photo");
  const [state, setState] = useState<State>({ stage: "idle" });
  const [choice, setChoice] = useState<FaceShape | null>(null);
  const firstScan = useRef(true);

  async function scan(source: Blob) {
    setChoice(null);
    setState({ stage: "busy", first: firstScan.current });
    try {
      const photo = await resizeToJpeg(source, 1280, 0.9).catch(() => source);
      const d = await detectFace(photo);
      firstScan.current = false;
      const result = classifyFace(d.faces, d.width, d.height, d.foreheadSkin);
      if (!result.ok) return setState({ stage: "fail", message: result.tip, retry: true });
      setChoice(result.level === "high" ? result.primary : null);
      setState({ stage: "done", shown: { bitmap: d.bitmap, face: d.faces[0], width: d.width, height: d.height, result } });
    } catch {
      setState({ stage: "fail", message: "The face scan couldn't start on this device. You can pick your face shape yourself below.", retry: false });
    }
  }

  function confirm(shape: FaceShape, suggested: FaceShape | null) {
    saveProfile({ faceShape: shape, faceShapeSource: shape === suggested ? "suggested" : "picked" });
    onSaved?.(shape);
    setState({ stage: "idle" });
  }

  const current = profile?.faceShape ?? null;

  if (state.stage === "busy") {
    return (
      <div className="relative aspect-[16/9] overflow-hidden rounded-[var(--r-tile)]">
        <HairpinLoader variant="panel" label="Scanning your face" steps={state.first ? ["Loading the scanner (one time)", "Finding your face", "Measuring"] : ["Finding your face", "Measuring"]} stepEvery={1800} />
      </div>
    );
  }

  if (state.stage === "done") {
    const { result } = state.shown;
    const suggested = result.level === "high" ? result.primary : null;
    return (
      <div className="stagger-in flex flex-col gap-4">
        <Overlay shown={state.shown} />
        {result.hairOverForehead && <Notice>Hair seems to cover your forehead, so we used your jaw and cheeks only. Pull hair back for a better read.</Notice>}
        <p role="status" className="font-serif text-title">
          {describeResult(result)}
        </p>
        <div role="group" aria-label="Your face shape" className="flex flex-wrap gap-2">
          {FACE_SHAPES.map((s) => (
            <Chip key={s} selected={choice === s} onClick={() => setChoice(s)}>
              <span className="capitalize">{s}</span>
              {s === result.primary && result.level !== "low" && <span className="ml-1.5 text-caption opacity-70">suggested</span>}
              {s === result.runnerUp && result.level === "medium" && <span className="ml-1.5 text-caption opacity-70">close</span>}
            </Chip>
          ))}
        </div>
        {choice && <FaceShapeGuideCard shape={choice} />}
        <div className="flex flex-wrap gap-3">
          <Button disabled={!choice} onClick={() => choice && confirm(choice, suggested ?? result.primary)}>
            {choice ? `Use ${choice}` : "Pick the one that fits"}
          </Button>
          <Button variant="ghost" onClick={() => setState({ stage: "idle" })}>
            Cancel
          </Button>
        </div>
        <p className="text-caption text-stone">Measured on this device. Only the shape is saved, not the photo. Face shape is a styling convention, so change it if it doesn&apos;t feel right.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {current ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="font-serif text-title capitalize">{current}</p>
            <button type="button" className="text-caption text-stone underline underline-offset-4 hover:text-ivory" onClick={() => saveProfile({ faceShape: null, faceShapeSource: null })}>
              Clear
            </button>
          </div>
          <FaceShapeGuideCard shape={current} />
        </>
      ) : (
        <p className="text-body text-stone">Scan a front-facing photo to see where your cheekbones, jaw and forehead sit, then see cuts often picked for your shape.</p>
      )}
      <div role="group" aria-label="Pick your face shape" className="flex flex-wrap gap-2">
        {FACE_SHAPES.map((s) => (
          <Chip key={s} selected={current === s} onClick={() => saveProfile({ faceShape: s, faceShapeSource: "picked" })}>
            <span className="capitalize">{s}</span>
          </Chip>
        ))}
      </div>
      <div className="flex flex-wrap gap-3">
        {saved && (
          <Button variant={current ? "ghost" : "primary"} onClick={() => scan(saved.blob)}>
            {current ? "Scan my saved photo again" : "Scan my saved photo"}
          </Button>
        )}
        <label className={`${buttonClass(saved || current ? "ghost" : "primary")} cursor-pointer focus-within:outline-2 focus-within:outline-champagne-light`}>
          {saved ? "Use another photo" : "Scan my face"}
          <input type="file" accept="image/*" className="sr-only" onChange={(e) => e.target.files?.[0] && scan(e.target.files[0])} />
        </label>
      </div>
      <p className="text-caption text-stone">The scan runs on this device and your photo isn&apos;t uploaded. The first scan downloads about 18 MB once, then it&apos;s cached.</p>
      {state.stage === "fail" && <Notice tone="error">{state.message}</Notice>}
    </div>
  );
}
