/**
 * Face shape from MediaPipe Face Landmarker points, on the device. Pure and dependency-free so it can be tested on
 * landmark fixtures (tests/fixtures/faces, extracted from the project's own portraits).
 *
 * Honest limits: face-shape categories are a styling convention, and this is a geometric heuristic. The mesh's top
 * point (10) is fitted, not seen, so hair over the forehead can't be detected from geometry; the caller samples skin
 * there and passes `foreheadSkin`. All boundaries below are provisional priors expressed relative to an average
 * face (see CAL), not values measured on a labelled population. The result is only ever a suggestion the person
 * confirms or changes.
 */
import type { FaceShape } from "./style";

export type Point = { x: number; y: number };

/** Verified against MediaPipe's face mesh connections (FACEMESH_FACE_OVAL). */
export const FACE_OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109];
export const LM = Object.freeze({
  top: 10,
  chin: 152,
  cheekR: 234,
  cheekL: 454,
  templeR: 54,
  templeL: 284,
  jawR: 58,
  jawL: 288,
  gonionR: 172,
  gonionL: 397,
  eyeR: 33,
  eyeL: 263,
  nose: 1,
  lipTop: 13,
  lipBottom: 14,
  chinSideR: 149,
  chinSideL: 378,
});

export type Measurements = {
  /** Degrees the head is tilted in the picture (corrected before measuring). */
  roll: number;
  /** 0 = facing the camera; larger = turned. */
  yaw: number;
  /** Mesh length / cheekbone width. */
  lw: number;
  /** Forehead (temples) / cheekbone width. */
  fw: number;
  /** Lower jaw / cheekbone width. */
  jw: number;
  /** Forehead / lower jaw. */
  fj: number;
  /** Angle at the chin, degrees: smaller = more pointed. */
  chin: number;
  /** Angle at the jaw corners, degrees: smaller = more angular. */
  jaw: number;
  /** Mouth opening / length. */
  mouth: number;
  /** Face width / image width. */
  size: number;
  /** Every oval point inside the frame. */
  inFrame: boolean;
};

const deg = (r: number) => (r * 180) / Math.PI;
const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
function angleAt(v: Point, a: Point, b: Point) {
  const ax = a.x - v.x,
    ay = a.y - v.y,
    bx = b.x - v.x,
    by = b.y - v.y;
  const c = (ax * bx + ay * by) / (Math.hypot(ax, ay) * Math.hypot(bx, by));
  return deg(Math.acos(Math.max(-1, Math.min(1, c))));
}

/** Measurements in pixel space with the head's roll removed (normalised x/y would distort non-square photos). */
export function measure(norm: readonly { x: number; y: number }[], width: number, height: number): Measurements {
  const px = norm.map((p) => ({ x: p.x * width, y: p.y * height }));
  const eR = px[LM.eyeR],
    eL = px[LM.eyeL];
  const rollRad = Math.atan2(eL.y - eR.y, eL.x - eR.x);
  const cx = (eR.x + eL.x) / 2,
    cy = (eR.y + eL.y) / 2;
  const cos = Math.cos(-rollRad),
    sin = Math.sin(-rollRad);
  const p = px.map((q) => ({ x: cx + (q.x - cx) * cos - (q.y - cy) * sin, y: cy + (q.x - cx) * sin + (q.y - cy) * cos }));

  const W = dist(p[LM.cheekR], p[LM.cheekL]);
  const L = dist(p[LM.top], p[LM.chin]);
  const F = dist(p[LM.templeR], p[LM.templeL]);
  const J = dist(p[LM.gonionR], p[LM.gonionL]);
  const dR = Math.abs(p[LM.nose].x - p[LM.cheekR].x);
  const dL = Math.abs(p[LM.cheekL].x - p[LM.nose].x);
  const jawR = angleAt(p[LM.gonionR], p[LM.cheekR], p[LM.chin]);
  const jawL = angleAt(p[LM.gonionL], p[LM.cheekL], p[LM.chin]);
  const inFrame = FACE_OVAL.every((i) => norm[i].x >= -0.01 && norm[i].x <= 1.01 && norm[i].y >= -0.01 && norm[i].y <= 1.01);

  return {
    roll: deg(rollRad),
    yaw: Math.abs(dR - dL) / (dR + dL),
    lw: L / W,
    fw: F / W,
    jw: J / W,
    fj: F / J,
    chin: angleAt(p[LM.chin], p[LM.chinSideR], p[LM.chinSideL]),
    jaw: (jawR + jawL) / 2,
    mouth: dist(p[LM.lipTop], p[LM.lipBottom]) / L,
    size: W / width,
    inFrame,
  };
}

// ---- classification -------------------------------------------------------------------------------------------------

/** A soft "this value fits" curve: 0 outside (a, d), 1 between b and c, linear ramps between. */
const trap = (x: number, a: number, b: number, c: number, d: number) => (x <= a || x >= d ? 0 : x < b ? (x - a) / (b - a) : x <= c ? 1 : (d - x) / (d - c));

type Feature = "lw" | "fw" | "jw" | "fj" | "chin" | "jaw";
/**
 * PROVISIONAL priors, in the mesh's own measurement space (not the same as tape-measure ratios). Each shape lists, per
 * feature, [a, b, c, d, weight] for `trap`. They encode the textbook descriptions (oblong = long, round = short with a
 * soft jaw, square = strong jaw, heart = wide forehead and pointed chin, diamond = narrow forehead and jaw, oval =
 * balanced) and were NOT fitted to a labelled set. Revisit with real data before treating them as accurate.
 */
const PRIOR: Record<FaceShape, Partial<Record<Feature, [number, number, number, number, number]>>> = {
  oval: { lw: [1.12, 1.2, 1.3, 1.4, 3], fj: [0.9, 1.0, 1.12, 1.25, 2], jw: [0.72, 0.78, 0.86, 0.92, 1.5], jaw: [118, 124, 134, 140, 1] },
  round: { lw: [0.95, 1.05, 1.15, 1.22, 3], jaw: [126, 132, 150, 160, 2], chin: [146, 152, 175, 180, 1.5], jw: [0.8, 0.85, 1, 1.1, 1] },
  square: { lw: [1.0, 1.08, 1.24, 1.32, 2], jw: [0.84, 0.9, 1.1, 1.2, 3], jaw: [100, 108, 126, 132, 3], fj: [0.85, 0.93, 1.07, 1.15, 1.5] },
  heart: { fj: [1.08, 1.16, 1.5, 1.7, 3], jw: [0.55, 0.62, 0.78, 0.83, 2], chin: [110, 120, 148, 154, 2], fw: [0.82, 0.88, 1.1, 1.2, 1] },
  oblong: { lw: [1.26, 1.34, 1.7, 2.0, 4], fj: [0.88, 0.96, 1.15, 1.3, 1], jaw: [112, 120, 140, 148, 1] },
  diamond: { fw: [0.6, 0.68, 0.8, 0.86, 3], jw: [0.6, 0.66, 0.8, 0.86, 2.5], fj: [0.85, 0.93, 1.1, 1.2, 1], lw: [1.1, 1.18, 1.4, 1.5, 1] },
};
/** Features that depend on where the forehead and hairline are, unusable when hair covers them. */
const NEEDS_FOREHEAD: readonly Feature[] = ["lw", "fw", "fj"];

export const LIMITS = Object.freeze({ minSize: 0.2, maxRoll: 35, maxYaw: 0.15, maxMouth: 0.05, minSkin: 0.5, hairCap: 0.5 });

export type FaceFail = "no-face" | "many-faces" | "too-small" | "cropped" | "tilted" | "turned" | "mouth-open";
export const FAIL_TIP: Readonly<Record<FaceFail, string>> = Object.freeze({
  "no-face": "We couldn't find a face. Try a clear, front-facing photo in good light.",
  "many-faces": "More than one face is in this photo. Use one with just you.",
  "too-small": "Your face is quite small in this photo. Move closer or crop in.",
  cropped: "Part of your face is cut off. Keep your whole face and chin in frame.",
  tilted: "Your head is tilted a lot. Look straight at the camera with your head level.",
  turned: "Your head is turned. Face the camera directly.",
  "mouth-open": "Your mouth is open, which changes the jaw. Try a relaxed, closed mouth.",
});

export type Level = "high" | "medium" | "low";
export type FaceResult =
  | { ok: false; reason: FaceFail; tip: string }
  | {
      ok: true;
      primary: FaceShape;
      runnerUp: FaceShape;
      /** 0..1, how clear the call is. */
      confidence: number;
      level: Level;
      scores: Record<FaceShape, number>;
      measurements: Measurements;
      /** Hair covers the forehead, so only the jaw and cheeks were used. */
      hairOverForehead: boolean;
    };

export function checkMeasurements(m: Measurements): FaceFail | null {
  if (!m.inFrame) return "cropped";
  if (m.size < LIMITS.minSize) return "too-small";
  if (Math.abs(m.roll) > LIMITS.maxRoll) return "tilted";
  if (m.yaw > LIMITS.maxYaw) return "turned";
  if (m.mouth > LIMITS.maxMouth) return "mouth-open";
  return null;
}

export function scoreShapes(m: Measurements, useForehead = true): Record<FaceShape, number> {
  const out = {} as Record<FaceShape, number>;
  for (const shape of Object.keys(PRIOR) as FaceShape[]) {
    let sum = 0;
    let wsum = 0;
    for (const [f, [a, b, c, d, w]] of Object.entries(PRIOR[shape]) as [Feature, [number, number, number, number, number]][]) {
      if (!useForehead && NEEDS_FOREHEAD.includes(f)) continue;
      sum += w * trap(m[f], a, b, c, d);
      wsum += w;
    }
    out[shape] = wsum ? sum / wsum : 0;
  }
  return out;
}

/**
 * Classifies one face. `faces` is the list of detected faces (normalised landmarks); `foreheadSkin` is the share of
 * sampled forehead pixels that look like skin (0..1), or null if it wasn't measured.
 */
export function classifyFace(faces: readonly (readonly { x: number; y: number }[])[], width: number, height: number, foreheadSkin: number | null = null): FaceResult {
  const fail = (reason: FaceFail): FaceResult => ({ ok: false, reason, tip: FAIL_TIP[reason] });
  if (!faces.length || faces[0].length < 468) return fail("no-face");
  if (faces.length > 1) return fail("many-faces");
  const m = measure(faces[0], width, height);
  const bad = checkMeasurements(m);
  if (bad) return fail(bad);

  const hairOverForehead = foreheadSkin !== null && foreheadSkin < LIMITS.minSkin;
  const scores = scoreShapes(m, !hairOverForehead);
  const ranked = (Object.entries(scores) as [FaceShape, number][]).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const [primary, top] = ranked[0];
  const [runnerUp, second] = ranked[1];
  let confidence = Math.max(0, Math.min(1, top * 0.6 + Math.min(1, (top - second) / 0.3) * 0.4));
  if (hairOverForehead) confidence = Math.min(confidence, LIMITS.hairCap);
  const level: Level = confidence >= 0.65 ? "high" : confidence >= 0.4 ? "medium" : "low";
  return { ok: true, primary, runnerUp, confidence, level, scores, measurements: m, hairOverForehead };
}

/** Plain-words summary for the result card. Never a promise. */
export function describeResult(r: Extract<FaceResult, { ok: true }>): string {
  const shape = (s: FaceShape) => s;
  if (r.level === "high") return `Your face geometry suggests ${shape(r.primary)}.`;
  if (r.level === "medium") return `Closest to ${shape(r.primary)}, with some ${shape(r.runnerUp)}.`;
  return `Between ${shape(r.primary)} and ${shape(r.runnerUp)}. Pick whichever feels right.`;
}
