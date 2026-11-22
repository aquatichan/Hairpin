#!/usr/bin/env node
/**
 * Cut the golden-peony source sheets in design/asset-sources/ into individual
 * transparent PNGs under public/assets/botanicals/, and register them in the manifest.
 *
 *   node scripts/extract-botanicals.mjs [--list]
 *
 * Large single blooms become the four corner peonies; small isolated pieces from the
 * sheets become the drifting petals. Connected components are found on the alpha channel,
 * each is isolated (neighbouring fragments erased) and trimmed to its bounding box.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "..");
const src = (f) => path.join(root, "design/asset-sources", f);
const out = path.join(root, "public/assets/botanicals");
const manifestPath = path.join(root, "design/asset-manifest.json");
const listOnly = process.argv.includes("--list");

const SINGLES = {
  "botanical-peony-tl": { file: "Gilded Golden Bloom Ornament-5.png", flop: false },
  "botanical-peony-tr": { file: "Ornate Golden Peony Arrangement-1.png", flop: false },
  "botanical-peony-bl": { file: "Luxurious Golden Peony Ornament-8.png", flop: false },
  "botanical-peony-br": { file: "Luxurious Golden Peony Ornament-8.png", flop: true },
};
const PETAL_SHEET = "Golden Peony Botanical Asset Collection-6.png";

async function components(file, minArea) {
  const { data, info } = await sharp(src(file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const label = new Int32Array(w * h);
  const comps = [];
  const stack = [];
  for (let i = 0; i < w * h; i++) {
    if (label[i] || data[i * 4 + 3] < 40) continue;
    const id = comps.length + 1;
    let minX = w, minY = h, maxX = 0, maxY = 0, area = 0;
    stack.push(i);
    label[i] = id;
    while (stack.length) {
      const p = stack.pop();
      const x = p % w, y = (p / w) | 0;
      area++;
      if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const q = ny * w + nx;
        if (!label[q] && data[q * 4 + 3] >= 40) (label[q] = id, stack.push(q));
      }
    }
    if (area >= minArea) comps.push({ id, area, minX, minY, maxX, maxY });
  }
  return { comps, label, data, w, h };
}

async function cut(sheet, c, outFile, flop = false, maxSide = 0) {
  const { label, data, w } = sheet;
  const cw = c.maxX - c.minX + 1, ch = c.maxY - c.minY + 1;
  const buf = Buffer.alloc(cw * ch * 4);
  for (let y = 0; y < ch; y++)
    for (let x = 0; x < cw; x++) {
      const p = (c.minY + y) * w + (c.minX + x);
      if (label[p] !== c.id && data[p * 4 + 3] > 0) continue; // erase neighbours
      const o = (y * cw + x) * 4;
      buf[o] = data[p * 4]; buf[o + 1] = data[p * 4 + 1]; buf[o + 2] = data[p * 4 + 2];
      buf[o + 3] = label[p] === c.id ? data[p * 4 + 3] : 0;
    }
  let img = sharp(buf, { raw: { width: cw, height: ch, channels: 4 } });
  if (flop) img = img.flop();
  if (maxSide) img = img.resize({ width: maxSide, height: maxSide, fit: "inside", withoutEnlargement: true });
  img = outFile.endsWith(".webp") ? img.webp({ quality: 86, alphaQuality: 92, effort: 5 }) : img.png({ compressionLevel: 9 });
  const info = await img.toFile(outFile);
  return { width: info.width, height: info.height };
}

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const upsert = (id, patch, base) => {
  let e = manifest.assets.find((a) => a.id === id);
  if (!e) manifest.assets.push((e = { id, section: "botanicals", alpha: true, format: "png", fit: "contain", object_position: "50% 50%", object_position_mobile: "50% 50%", ...base }));
  Object.assign(e, patch, { status: "integrated" });
};

if (listOnly) {
  for (const f of new Set([...Object.values(SINGLES).map((s) => s.file), PETAL_SHEET])) {
    const s = await components(f, 400);
    console.log(f, s.comps.map((c) => `${c.maxX - c.minX + 1}x${c.maxY - c.minY + 1}(a${c.area})`).join(" "));
  }
  process.exit(0);
}

await mkdir(out, { recursive: true });

// Corner peonies: the single largest component of each source.
const cache = new Map();
for (const [id, { file, flop }] of Object.entries(SINGLES)) {
  if (!cache.has(file)) cache.set(file, await components(file, 5000));
  const s = cache.get(file);
  const big = [...s.comps].sort((a, b) => b.area - a.area)[0];
  const dims = await cut(s, big, path.join(out, `${id}.webp`), flop, 800);
  upsert(id, { ...dims, format: "webp", file: `/assets/botanicals/${id}.webp` });
  console.log(`${id}: ${dims.width}x${dims.height}`);
}

// Smaller blooms (with leaves) from the same sheet, for filling space elsewhere on the page.
let bn = 0;
const bloomSheet = await components(PETAL_SHEET, 100000);
for (const c of bloomSheet.comps.sort((a, b) => b.area - a.area).slice(0, 4)) {
  const id = `botanical-bloom-${String(++bn).padStart(2, "0")}`;
  const dims = await cut(bloomSheet, c, path.join(out, `${id}.webp`), false, 640);
  upsert(id, { ...dims, format: "webp", file: `/assets/botanicals/${id}.webp` }, { purpose: "Small gold bloom with leaves cut from the source sheet" });
  console.log(`${id}: ${dims.width}x${dims.height}`);
}

// Petals: small isolated pieces from the sheet, most substantial first.
const sheet = await components(PETAL_SHEET, 700);
const petals = sheet.comps
  .filter((c) => {
    const cw = c.maxX - c.minX + 1, ch = c.maxY - c.minY + 1;
    return Math.max(cw, ch) <= 190 && Math.max(cw, ch) >= 70 && c.area > 0.28 * cw * ch;
  })
  .sort((a, b) => b.area - a.area)
  .slice(0, 8);
let n = 0;
for (const c of petals) {
  const id = `botanical-petal-${String(++n).padStart(2, "0")}`;
  const dims = await cut(sheet, c, path.join(out, `${id}.png`));
  upsert(id, { ...dims, file: `/assets/botanicals/${id}.png`, target_px: [dims.width, dims.height] }, { purpose: "Single drifting gold petal cut from the source sheet" });
  console.log(`${id}: ${dims.width}x${dims.height}`);
}

await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
