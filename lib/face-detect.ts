"use client";

import type { FaceLandmarker } from "@mediapipe/tasks-vision";
import { LM } from "./face-shape";

/**
 * Loads MediaPipe Face Landmarker from our own /mediapipe folder (nothing comes from Google at runtime) and runs it
 * on a photo in the browser. The photo never leaves the device. Loaded only when the person taps "Scan my face".
 */
let landmarker: Promise<FaceLandmarker> | null = null;

export function loadLandmarker(): Promise<FaceLandmarker> {
  landmarker ??= (async () => {
    const { FaceLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision");
    const fileset = await FilesetResolver.forVisionTasks("/mediapipe/wasm");
    return FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: "/mediapipe/face_landmarker.task", delegate: "CPU" },
      runningMode: "IMAGE",
      numFaces: 2,
    });
  })().catch((e) => {
    landmarker = null; // allow a retry
    throw e;
  });
  return landmarker;
}

export type Detected = { faces: { x: number; y: number }[][]; width: number; height: number; foreheadSkin: number | null; bitmap: ImageBitmap };

/** Runs detection on a photo blob. Downscales very large photos first. */
export async function detectFace(blob: Blob): Promise<Detected> {
  const lm = await loadLandmarker();
  const source = await createImageBitmap(blob);
  const scale = Math.min(1, 1280 / Math.max(source.width, source.height));
  const w = Math.round(source.width * scale);
  const h = Math.round(source.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(source, 0, 0, w, h);
  source.close();
  const result = lm.detect(canvas);
  const faces = result.faceLandmarks.map((f) => f.map((p) => ({ x: p.x, y: p.y })));
  const foreheadSkin = faces.length === 1 ? sampleForeheadSkin(ctx, faces[0], w, h) : null;
  return { faces, width: w, height: h, foreheadSkin, bitmap: await createImageBitmap(canvas) };
}

type RGB = [number, number, number];

/**
 * Share of forehead samples whose colour is close to the cheeks' (skin). Hair over the forehead is usually far from it.
 * Returns null when the sampling area can't be read. Heuristic: deliberately lenient, it only flags clear cases.
 */
function sampleForeheadSkin(ctx: CanvasRenderingContext2D, face: { x: number; y: number }[], w: number, h: number): number | null {
  const at = (i: number) => ({ x: face[i].x * w, y: face[i].y * h });
  const px = (x: number, y: number): RGB | null => {
    if (x < 0 || y < 0 || x >= w || y >= h) return null;
    const d = ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data;
    return [d[0], d[1], d[2]];
  };
  const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
  // Cheeks: points between nose and cheekbones.
  const cheeks: RGB[] = [];
  for (const [a, b] of [[LM.cheekR, LM.nose], [LM.cheekL, LM.nose]] as const) {
    for (const t of [0.35, 0.5, 0.65]) {
      const A = at(a), B = at(b);
      const c = px(A.x + (B.x - A.x) * t, A.y + (B.y - A.y) * t + (at(LM.chin).y - at(LM.top).y) * 0.06);
      if (c) cheeks.push(c);
    }
  }
  if (cheeks.length < 4) return null;
  const ref: RGB = [median(cheeks.map((c) => c[0])), median(cheeks.map((c) => c[1])), median(cheeks.map((c) => c[2]))];
  // Forehead: a grid between the top point and the brow line, inside the temples.
  const top = at(LM.top), tR = at(LM.templeR), tL = at(LM.templeL);
  const browY = (at(LM.eyeR).y + at(LM.eyeL).y) / 2 - (at(LM.chin).y - top.y) * 0.18;
  let skin = 0, total = 0;
  for (let i = 1; i <= 4; i++) {
    for (let j = 1; j <= 5; j++) {
      const x = tR.x + ((tL.x - tR.x) * j) / 6;
      const y = top.y + ((browY - top.y) * i) / 5;
      const c = px(x, y);
      if (!c) continue;
      total++;
      // Same skin tone: similar chromaticity, and not much darker or lighter than the cheeks.
      const sum = c[0] + c[1] + c[2] + 1, rs = ref[0] + ref[1] + ref[2] + 1;
      const chroma = Math.hypot(c[0] / sum - ref[0] / rs, c[1] / sum - ref[1] / rs);
      const lum = Math.abs(sum / rs - 1);
      if (chroma < 0.045 && lum < 0.45) skin++;
    }
  }
  return total >= 12 ? skin / total : null;
}
