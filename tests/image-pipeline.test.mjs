import assert from "node:assert/strict";
import { test } from "node:test";
import { PIPELINE, attempts, fitWithin } from "../lib/image-pipeline.ts";

test("fitWithin caps the long side, keeps the ratio and never enlarges", () => {
  assert.deepEqual(fitWithin(4000, 3000, 960), { width: 960, height: 720 });
  assert.deepEqual(fitWithin(3000, 4000, 960), { width: 720, height: 960 });
  assert.deepEqual(fitWithin(600, 800, 960), { width: 600, height: 800 });
  assert.deepEqual(fitWithin(1, 5000, 960), { width: 1, height: 960 }, "never zero");
});

test("attempts go from best quality to smaller sizes and stop at a sensible floor", () => {
  const list = attempts(4000, 3000);
  assert.deepEqual(list.slice(0, PIPELINE.qualities.length).map((a) => a.quality), PIPELINE.qualities);
  assert.ok(list.slice(0, PIPELINE.qualities.length).every((a) => a.width === 960 && a.height === 720));
  const sides = list.map((a) => Math.max(a.width, a.height));
  for (let i = 1; i < sides.length; i++) assert.ok(sides[i] <= sides[i - 1]);
  assert.ok(Math.min(...sides) >= PIPELINE.minSide * 0.85, "never shrinks past the floor");
  assert.ok(list.length < 20, "bounded work");
});

test("a small photo is not enlarged", () => {
  for (const a of attempts(500, 400)) assert.ok(a.width <= 500 && a.height <= 400);
});
