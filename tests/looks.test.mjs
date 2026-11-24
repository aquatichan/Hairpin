import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { isAudience, isFaceShape, isKeepableLookId, isStyleTag, lookSource } from "../lib/style.ts";
import { sanitizeLibrary } from "../lib/library-model.ts";

const curated = new Set(["polished-waves", "placeholder-1"]);

test("saved IDs: curated must exist, private and community IDs are kept", () => {
  assert.ok(isKeepableLookId("polished-waves", curated));
  assert.ok(!isKeepableLookId("removed-look", curated), "an unknown curated slug is dropped");
  assert.ok(isKeepableLookId("p-8f3a2c", curated));
  assert.ok(isKeepableLookId("m-1a2b3c4d", curated));
  for (const bad of ["P-abc", "p_abc", "../x", "p-", "", 7, null, "a".repeat(65)]) assert.ok(!isKeepableLookId(bad, curated), String(bad));
  assert.equal(lookSource("p-abc"), "community");
  assert.equal(lookSource("m-abc"), "mine");
  assert.equal(lookSource("placeholder-1"), "curated");
});

test("a synced library keeps community and private looks", () => {
  const now = Date.now();
  const saved = ["p-abc", "m-def", "gone-look", "polished-waves"].map((lookId) => ({ lookId, savedAt: now }));
  const lib = sanitizeLibrary(
    { v: 2, saved, boards: [], tombstones: { saved: {}, boards: {}, items: {} }, resetAt: 0, updatedAt: now },
    (id) => isKeepableLookId(id, curated),
  );
  assert.ok(lib, "parses");
  const ids = lib.saved.map((s) => s.lookId);
  assert.deepEqual(ids.sort(), ["m-def", "p-abc", "polished-waves"]);
});

test("the curated manifest and generated catalog use only the shared vocabulary", () => {
  const { looks } = JSON.parse(readFileSync(new URL("../content/curated-looks.json", import.meta.url), "utf8"));
  const built = JSON.parse(readFileSync(new URL("../content/looks.generated.json", import.meta.url), "utf8"));
  const gallery = JSON.parse(readFileSync(new URL("../content/gallery.json", import.meta.url), "utf8"));
  assert.equal(built.length, looks.length, "run `npm run looks` after editing curated-looks.json");
  const ids = new Set();
  for (const l of [...built, ...gallery]) {
    assert.ok(!ids.has(l.id), `duplicate id ${l.id}`);
    ids.add(l.id);
    assert.ok(isAudience(l.audience), `${l.id} audience`);
    assert.ok(l.tags.length && l.tags.every(isStyleTag), `${l.id} tags`);
    assert.ok((l.faceShapes ?? []).every(isFaceShape), `${l.id} face shapes`);
    assert.ok(l.width > 0 && l.height > 0 && Math.max(l.width, l.height) <= 1448);
  }
  for (const l of built) assert.match(l.image, /^\/assets\/looks\/[a-z0-9-]+\.webp$/);
});
