/**
 * The one downsizing step for every photo that is stored as a "cut": applies the photo's orientation, caps the long
 * side at 960 px, re-encodes as WebP (JPEG where the browser can't encode WebP, e.g. Safari) at the highest quality that
 * fits in about 120 KB, and in doing so strips all metadata (location, device, time). The result is the only version
 * kept and shown everywhere. Runs in the browser during the upload screen; the server re-encodes again before storing
 * anything public (lib/posts.server.ts) so a bypassed client can't upload originals.
 *
 * No imports, so the pure helpers can be tested with `node --test`.
 */
export const PIPELINE = Object.freeze({ maxSide: 960, targetBytes: 120_000, hardMaxBytes: 250_000, qualities: [0.82, 0.74, 0.66, 0.58, 0.5], shrink: 0.85, minSide: 480 });

/** Dimensions that fit inside a `max` box, keeping the aspect ratio and never enlarging. */
export function fitWithin(width: number, height: number, max: number): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** The (quality, side) attempts in order: every quality at full size, then smaller sizes at a middling quality. */
export function attempts(width: number, height: number): { quality: number; width: number; height: number }[] {
  const out: { quality: number; width: number; height: number }[] = [];
  const first = fitWithin(width, height, PIPELINE.maxSide);
  for (const q of PIPELINE.qualities) out.push({ quality: q, ...first });
  let side = Math.max(first.width, first.height);
  while (side * PIPELINE.shrink >= PIPELINE.minSide) {
    side = Math.round(side * PIPELINE.shrink);
    out.push({ quality: 0.62, ...fitWithin(width, height, side) });
  }
  return out;
}

export type ProcessedImage = { blob: Blob; width: number; height: number; type: "image/webp" | "image/jpeg" };

const encode = (canvas: HTMLCanvasElement, type: string, quality: number) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));

/** Throws if the file isn't a readable image. */
export async function processCutImage(file: Blob): Promise<ProcessedImage> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    let best: ProcessedImage | null = null;
    // Browsers that can't encode WebP silently return PNG; detect that and use JPEG instead.
    let type: "image/webp" | "image/jpeg" = "image/webp";
    for (const a of attempts(bitmap.width, bitmap.height)) {
      const canvas = document.createElement("canvas");
      canvas.width = a.width;
      canvas.height = a.height;
      canvas.getContext("2d")!.drawImage(bitmap, 0, 0, a.width, a.height);
      let blob = await encode(canvas, type, a.quality);
      if (type === "image/webp" && blob && blob.type !== "image/webp") {
        type = "image/jpeg";
        blob = await encode(canvas, type, a.quality);
      }
      if (!blob) continue;
      best = { blob, width: a.width, height: a.height, type };
      if (blob.size <= PIPELINE.targetBytes) break;
    }
    if (!best || best.blob.size > PIPELINE.hardMaxBytes) throw new Error("That photo couldn't be made small enough.");
    return best;
  } finally {
    bitmap.close();
  }
}
