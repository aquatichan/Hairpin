/**
 * Generates the 12 hair-type reference images (1A-4C) with OpenAI's image API.
 *   node --env-file=.env.local scripts/generate-hair-types.mjs [1a 2b ...]
 * Writes public/assets/hair-types/hair-<type>.png (then converted to .webp). The key is read from the environment
 * by this process only and is never printed.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const KEY = process.env.OPENAI_API_KEY;
if (!KEY) {
  console.error("OPENAI_API_KEY is not set.");
  process.exit(1);
}
const MODEL = process.env.OPENAI_IMAGE_MODEL_GEN || "gpt-image-2.6-sunburst";
const OUT = path.join(process.cwd(), "public/assets/hair-types");

const STYLE =
  "Macro studio photograph of a single long lock of dark brown human hair, hanging vertically and centered, showing only the hair strand pattern. No face, no person, no scalp, no hands, no text, no labels. Deep warm black background, soft gold rim light from the upper right, shallow depth of field, crisp detail on the strands, luxury editorial look, square composition with the lock filling the middle third of the frame.";

const TYPES = {
  "1a": "Type 1A: completely straight, fine, silky hair with no bend at all, very smooth and glossy, lies perfectly flat.",
  "1b": "Type 1B: straight hair with medium thickness and a little body, a very slight bend near the ends, mostly smooth.",
  "1c": "Type 1C: straight but coarse, thick hair with visible body and a subtle soft bend, slightly less sleek.",
  "2a": "Type 2A: fine, loose, gentle S-shaped waves, barely defined, stretched out, mostly straight at the root.",
  "2b": "Type 2B: medium S-shaped waves clearly defined from the mid-lengths down, flatter at the root, light frizz.",
  "2c": "Type 2C: thick, well-defined deep S-waves starting near the root, close to loose curls, some frizz.",
  "3a": "Type 3A: large, loose, springy spiral curls about the width of a sidewalk chalk stick, shiny and well defined.",
  "3b": "Type 3B: bouncy ringlet curls about the width of a marker, tight and voluminous with clear definition.",
  "3c": "Type 3C: tight corkscrew curls about the width of a pencil or straw, densely packed and voluminous.",
  "4a": "Type 4A: dense, tightly coiled S-pattern coils about the width of a crochet needle, springy and defined.",
  "4b": "Type 4B: very tightly packed Z-shaped zigzag coils with sharp angles, less defined, fluffy and voluminous.",
  "4c": "Type 4C: extremely tight, densely packed zigzag coils with little visible definition, soft cotton-like texture, high shrinkage.",
};

const wanted = process.argv.slice(2).map((s) => s.toLowerCase());
const list = Object.entries(TYPES).filter(([t]) => !wanted.length || wanted.includes(t));

async function one([type, desc]) {
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, prompt: `${desc} ${STYLE}`, size: "1024x1024", quality: "medium", n: 1 }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${type}: ${res.status} ${body?.error?.message ?? "request failed"}`);
  const b64 = body?.data?.[0]?.b64_json;
  if (!b64) throw new Error(`${type}: no image in the response`);
  await writeFile(path.join(OUT, `hair-${type}.png`), Buffer.from(b64, "base64"));
  console.log(`ok ${type}`);
}

await mkdir(OUT, { recursive: true });
const queue = [...list];
const failures = [];
await Promise.all(
  Array.from({ length: 4 }, async () => {
    while (queue.length) {
      const item = queue.shift();
      try {
        await one(item);
      } catch (e) {
        failures.push(e.message);
        console.error(`failed ${e.message}`);
      }
    }
  }),
);
if (failures.length) process.exit(1);
