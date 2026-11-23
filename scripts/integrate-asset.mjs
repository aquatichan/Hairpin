#!/usr/bin/env node
/**
 * Integrate one approved image into the landing page. No component changes needed.
 *
 *   node scripts/integrate-asset.mjs <asset-id> <source-file> [--position "50% 30%"] [--dry-run]
 *
 * 1. Reads the asset's entry in design/asset-manifest.json.
 * 2. Center-crops (or crops at --position, defaulting to the manifest object_position)
 *    to the target aspect ratio and resizes to target_px. Never upscales; warns if smaller.
 * 3. Exports WebP (photography) or PNG (alpha assets) to public<file>.
 * 4. For alpha assets, verifies a real alpha channel with transparent pixels at the
 *    edges and opaque pixels inside (rejects checkerboards / solid mattes).
 * 5. Keeps the untouched source in design/asset-sources/ and marks the entry
 *    status "integrated" with the final width/height.
 */
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "..");
const manifestPath = path.join(root, "design/asset-manifest.json");

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args.splice(i, 2)[1];
};
const dry = args.includes("--dry-run") && args.splice(args.indexOf("--dry-run"), 1);
const position = flag("--position");
const [id, source] = args;
if (!id || !source) {
  console.error('Usage: node scripts/integrate-asset.mjs <asset-id> <source-file> [--position "50% 30%"] [--dry-run]');
  process.exit(1);
}

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const entry = manifest.assets.find((a) => a.id === id);
if (!entry) {
  console.error(`Unknown asset id "${id}". Known: ${manifest.assets.map((a) => a.id).join(", ")}`);
  process.exit(1);
}

const [tw, th] = entry.target_px;
const img = sharp(source, { failOn: "error" });
const meta = await img.metadata();
console.log(`${id}: source ${meta.width}x${meta.height} ${meta.format}${meta.hasAlpha ? " (alpha)" : ""} -> ${tw}x${th} ${entry.format}`);

// Crop window: largest rect of the target ratio, placed by the focal percentages.
const [fx, fy] = (position ?? entry.object_position ?? "50% 50%").split(/\s+/).map((v) => parseFloat(v) / 100);
const ratio = tw / th;
let cw = meta.width;
let ch = Math.round(cw / ratio);
if (ch > meta.height) {
  ch = meta.height;
  cw = Math.round(ch * ratio);
}
const left = Math.round((meta.width - cw) * (Number.isFinite(fx) ? fx : 0.5));
const top = Math.round((meta.height - ch) * (Number.isFinite(fy) ? fy : 0.5));
if (cw < tw) console.warn(`  warning: crop is ${cw}x${ch}, smaller than target; exporting at native size (no upscaling).`);

let pipeline = sharp(source).extract({ left, top, width: cw, height: ch }).resize({ width: tw, height: th, withoutEnlargement: true });

if (entry.alpha) {
  if (!meta.hasAlpha) fail("asset requires transparency but the source has no alpha channel.");
  const { data, info } = await pipeline.clone().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const alphaAt = (x, y) => data[(y * info.width + x) * info.channels + 3];
  let edge = 0;
  let edgeTransparent = 0;
  for (let x = 0; x < info.width; x += 4) for (const y of [0, info.height - 1]) (edge++, alphaAt(x, y) < 8 && edgeTransparent++);
  for (let y = 0; y < info.height; y += 4) for (const x of [0, info.width - 1]) (edge++, alphaAt(x, y) < 8 && edgeTransparent++);
  let opaque = 0;
  for (let i = 3; i < data.length; i += info.channels * 16) if (data[i] > 240) opaque++;
  const edgePct = (100 * edgeTransparent) / edge;
  console.log(`  alpha check: ${edgePct.toFixed(0)}% of edge pixels transparent, ${opaque} opaque samples`);
  // Corner art may touch one or two edges by design, but most of the border must be clear.
  if (edgePct < 40) fail("most edge pixels are opaque: likely a baked background or checkerboard.");
  if (opaque === 0) fail("no opaque pixels: image is empty.");
}

const outPath = path.join(root, "public", entry.file);
pipeline = entry.format === "png" ? pipeline.png({ compressionLevel: 9, palette: false }) : pipeline.webp({ quality: 82, effort: 5 });

if (dry) {
  console.log(`  dry run: would write ${path.relative(root, outPath)}`);
  process.exit(0);
}

await mkdir(path.dirname(outPath), { recursive: true });
const out = await pipeline.toFile(outPath);
const srcDir = path.join(root, "design/asset-sources");
await mkdir(srcDir, { recursive: true });
await copyFile(source, path.join(srcDir, `${id}${path.extname(source)}`));

Object.assign(entry, { status: "integrated", width: out.width, height: out.height });
if (position) entry.object_position = position;
await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
console.log(`  wrote ${path.relative(root, outPath)} (${out.width}x${out.height}, ${(out.size / 1024).toFixed(0)} KB) and marked "${id}" integrated.`);

function fail(msg) {
  console.error(`  rejected: ${msg}`);
  process.exit(1);
}
