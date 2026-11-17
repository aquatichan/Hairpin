/**
 * Imports haircut photos into the gallery.
 *
 *   node scripts/import-photos.mjs <folder>
 *
 * Every image in <folder> is resized to 900px wide (JPEG, metadata stripped,
 * which removes location data) into public/gallery, and gets an entry in
 * content/gallery.json. The name comes from the file name
 * ("textured-crop.jpg" -> "Textured crop"). Words in the file name that match
 * a length (short, medium, long) or texture (straight, wavy, curly, coily) set
 * those tags, so "curly-shag-long.jpg" is tagged long and curly. Edit
 * gallery.json afterwards to add credits or fix tags. Existing entries are kept.
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const src = process.argv[2];
if (!src) {
  console.error("Usage: node scripts/import-photos.mjs <folder>");
  process.exit(1);
}

const root = path.join(import.meta.dirname, "..");
const outDir = path.join(root, "public", "gallery");
const manifest = path.join(root, "content", "gallery.json");
const LENGTHS = ["short", "medium", "long"];
const TEXTURES = ["straight", "wavy", "curly", "coily"];

fs.mkdirSync(outDir, { recursive: true });
const entries = JSON.parse(fs.readFileSync(manifest, "utf8"));
const known = new Set(entries.map((e) => e.id));

const files = fs.readdirSync(src).filter((f) => /\.(jpe?g|png|webp|avif|heic)$/i.test(f)).sort();
for (const file of files) {
  const base = path.parse(file).name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  if (!base || known.has(base)) continue;
  const words = base.split("-");
  const out = path.join(outDir, `${base}.jpg`);
  const info = await sharp(path.join(src, file)).rotate().resize({ width: 900, withoutEnlargement: true }).jpeg({ quality: 82, mozjpeg: true }).toFile(out);
  const nameWords = words.filter((w) => !/^\d+$/.test(w));
  entries.push({
    id: base,
    name: (nameWords.join(" ") || base).replace(/^./, (c) => c.toUpperCase()),
    length: LENGTHS.find((l) => words.includes(l)) ?? "medium",
    texture: TEXTURES.find((t) => words.includes(t)) ?? "straight",
    notes: "",
    image: `/gallery/${base}.jpg`,
    width: info.width,
    height: info.height,
    credit: "",
    creditUrl: "",
  });
  known.add(base);
  console.log(`added ${base} (${info.width}x${info.height})`);
}

fs.writeFileSync(manifest, `${JSON.stringify(entries, null, 2)}\n`);
console.log(`${entries.length} photos in the gallery`);
