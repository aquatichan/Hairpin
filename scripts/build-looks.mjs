/**
 * Builds the curated looks.
 *
 *   npm run looks            (node scripts/build-looks.mjs)
 *
 * Reads content/curated-looks.json and the images in content/looks-src/. Each entry is validated against the
 * shared vocabulary (lib/style.ts, lib/hair-types.ts), each image is downsized to 960px on its long side as WebP
 * with metadata stripped, and a tiny blur placeholder is made. Writes public/assets/looks/<id>.webp and
 * content/looks.generated.json, which lib/looks.ts reads. Replacing an image: overwrite placeholder_N.png (any
 * jpg/png/webp/heic with the same base name also works) and run the script again.
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { isAudience, isFaceShape, isStyleTag } from "../lib/style.ts";

const root = path.join(import.meta.dirname, "..");
const srcDir = path.join(root, "content", "looks-src");
const outDir = path.join(root, "public", "assets", "looks");
const manifestIn = path.join(root, "content", "curated-looks.json");
const manifestOut = path.join(root, "content", "looks.generated.json");

const LONG_SIDE = 960;
const LOOK_ID = /^[a-z0-9]+(?:-[a-z0-9]+){0,7}$/;
const HAIR_TYPE = /^[1-4][abc]$/;
const LENGTHS = ["short", "medium", "long"];
const TEXTURE = { 1: "straight", 2: "wavy", 3: "curly", 4: "coily" };
const EXTS = [".png", ".jpg", ".jpeg", ".webp", ".heic", ".heif", ".avif"];

const { looks } = JSON.parse(fs.readFileSync(manifestIn, "utf8"));
const errors = [];
const seen = new Set();

/** placeholder_1.png -> placeholder-1 */
const idFromFile = (f) =>
  path
    .basename(f, path.extname(f))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/** The entry's file, or the same base name with another image extension (so a .jpg can replace a .png). */
function findSource(file) {
  const exact = path.join(srcDir, file);
  const base = path.basename(file, path.extname(file));
  const candidates = EXTS.map((e) => path.join(srcDir, base + e)).filter((p) => fs.existsSync(p));
  // Prefer a newer non-placeholder replacement when both exist.
  candidates.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return candidates[0] ?? (fs.existsSync(exact) ? exact : null);
}

function validate(e, i) {
  const where = `looks[${i}] (${e.file ?? "no file"})`;
  const id = e.id ?? (e.file ? idFromFile(e.file) : "");
  if (!e.file) errors.push(`${where}: "file" is required`);
  if (!LOOK_ID.test(id) || id.length > 64) errors.push(`${where}: id "${id}" must be lowercase words joined by single hyphens`);
  if (seen.has(id)) errors.push(`${where}: duplicate id "${id}"`);
  seen.add(id);
  if (!e.name || typeof e.name !== "string") errors.push(`${where}: "name" is required`);
  if (!e.description || typeof e.description !== "string") errors.push(`${where}: "description" is required`);
  if (!isAudience(e.audience)) errors.push(`${where}: audience must be men, women or any`);
  if (!LENGTHS.includes(e.length)) errors.push(`${where}: length must be short, medium or long`);
  if (!HAIR_TYPE.test(e.hairType ?? "")) errors.push(`${where}: hairType must be 1a-4c`);
  for (const s of e.faceShapes ?? []) if (!isFaceShape(s)) errors.push(`${where}: unknown face shape "${s}"`);
  if (!Array.isArray(e.tags) || !e.tags.length) errors.push(`${where}: give at least one tag`);
  for (const t of e.tags ?? []) if (!isStyleTag(t)) errors.push(`${where}: "${t}" isn't in STYLE_TAGS (lib/style.ts)`);
  return id;
}

const ids = looks.map(validate);
if (errors.length) {
  console.error(`curated-looks.json has ${errors.length} problem(s):\n  ${errors.join("\n  ")}`);
  process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });
const out = [];
const missing = [];
for (const [i, e] of looks.entries()) {
  const id = ids[i];
  const src = findSource(e.file);
  if (!src) {
    missing.push(e.file);
    continue;
  }
  const img = sharp(src).rotate(); // apply EXIF orientation; output carries no metadata
  const resized = img.resize({ width: LONG_SIDE, height: LONG_SIDE, fit: "inside", withoutEnlargement: true });
  const { data, info } = await resized.clone().webp({ quality: 80, effort: 5 }).toBuffer({ resolveWithObject: true });
  fs.writeFileSync(path.join(outDir, `${id}.webp`), data);
  const tiny = await sharp(src).rotate().resize(16, 16, { fit: "inside" }).webp({ quality: 40 }).toBuffer();
  const stat = fs.statSync(src);
  out.push({
    id,
    name: e.name,
    notes: e.description,
    alt: e.alt ?? e.name,
    audience: e.audience,
    length: e.length,
    texture: TEXTURE[e.hairType[0]],
    hairType: e.hairType,
    faceShapes: e.faceShapes ?? [],
    tags: e.tags,
    image: `/assets/looks/${id}.webp`,
    width: info.width,
    height: info.height,
    blur: `data:image/webp;base64,${tiny.toString("base64")}`,
    illustrative: e.illustrative === true,
    credit: e.credit ?? "",
    creditUrl: e.creditUrl ?? "",
    createdAt: Math.round(stat.mtimeMs),
  });
  console.log(`ok ${id}  ${info.width}x${info.height}  ${(data.length / 1024).toFixed(0)} KB`);
}

// Drop outputs whose entries were removed, so deleted looks don't linger in public/.
const keep = new Set(out.map((l) => `${l.id}.webp`));
for (const f of fs.readdirSync(outDir)) if (f.endsWith(".webp") && !keep.has(f)) fs.rmSync(path.join(outDir, f));

fs.writeFileSync(manifestOut, JSON.stringify(out, null, 2) + "\n");
console.log(`\n${out.length} look(s) written to content/looks.generated.json`);
if (missing.length) {
  console.error(`Missing images (skipped): ${missing.join(", ")}`);
  process.exit(1);
}
