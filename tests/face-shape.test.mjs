import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { FACE_OVAL, LM, classifyFace, measure, scoreShapes } from "../lib/face-shape.ts";
import { FACE_SHAPE_GUIDE, faceTags } from "../lib/face-shape-guide.ts";
import { FACE_SHAPES, STYLE_TAGS } from "../lib/style.ts";

const dir = new URL("./fixtures/faces/", import.meta.url);
const fixtures = readdirSync(dir).map((f) => {
  const j = JSON.parse(readFileSync(new URL(f, dir), "utf8"));
  return { name: f.replace(".json", ""), width: j.width, height: j.height, face: j.faces[0].map(([x, y]) => ({ x, y })), faces: j.faces.length };
});

test("the fixtures are real mesh output: 478 points, one face each", () => {
  assert.ok(fixtures.length >= 20);
  for (const f of fixtures) assert.equal(f.face.length, 478, f.name);
  assert.equal(FACE_OVAL.length, 36);
  assert.equal(new Set(FACE_OVAL).size, 36);
});

test("every project portrait passes the checks and gets a ranked, deterministic answer", () => {
  for (const f of fixtures) {
    const r = classifyFace([f.face], f.width, f.height, 1);
    assert.ok(r.ok, `${f.name}: ${!r.ok && r.reason}`);
    assert.ok(FACE_SHAPES.includes(r.primary) && FACE_SHAPES.includes(r.runnerUp) && r.primary !== r.runnerUp);
    assert.ok(r.confidence >= 0 && r.confidence <= 1);
    assert.deepEqual(r, classifyFace([f.face], f.width, f.height, 1));
  }
});

test("measurements do not depend on head roll", () => {
  const f = fixtures[0];
  const base = measure(f.face, f.width, f.height);
  for (const angle of [-25, 12, 30]) {
    const a = (angle * Math.PI) / 180;
    // Rotate the points about the image centre in pixel space, then back to normalised.
    const cx = f.width / 2, cy = f.height / 2;
    const rot = f.face.map((p) => {
      const x = p.x * f.width - cx, y = p.y * f.height - cy;
      return { x: (cx + x * Math.cos(a) - y * Math.sin(a)) / f.width, y: (cy + x * Math.sin(a) + y * Math.cos(a)) / f.height };
    });
    const m = measure(rot, f.width, f.height);
    for (const k of ["lw", "fw", "jw", "fj", "chin", "jaw"]) assert.ok(Math.abs(m[k] - base[k]) < 0.01 * Math.max(1, Math.abs(base[k])), `${k} at ${angle}: ${m[k]} vs ${base[k]}`);
    assert.ok(Math.abs(Math.abs(m.roll - base.roll) - Math.abs(angle)) < 0.5);
  }
});

test("the same photo at another size and aspect gives the same shape", () => {
  const f = fixtures[3];
  const a = classifyFace([f.face], f.width, f.height, 1);
  // Pad the canvas: normalised coordinates shrink toward the middle, pixel geometry is unchanged.
  const W = f.width * 2, H = f.height * 1.5, ox = f.width / 2, oy = f.height / 4;
  const padded = f.face.map((p) => ({ x: (p.x * f.width + ox) / W, y: (p.y * f.height + oy) / H }));
  const b = classifyFace([padded], W, H, 1);
  assert.ok(a.ok && b.ok);
  assert.equal(a.primary, b.primary);
  assert.ok(Math.abs(a.measurements.lw - b.measurements.lw) < 1e-6);
});

test("before/after portraits of one person land on the same or an adjacent call", () => {
  for (const n of ["01", "02", "03", "04"]) {
    const a = fixtures.find((f) => f.name === `transform-${n}-before`), b = fixtures.find((f) => f.name === `transform-${n}-after`);
    const ra = classifyFace([a.face], a.width, a.height, 1), rb = classifyFace([b.face], b.width, b.height, 1);
    assert.ok(ra.ok && rb.ok);
    const top2 = new Set([ra.primary, ra.runnerUp]);
    assert.ok(top2.has(rb.primary), `${n}: ${ra.primary}/${ra.runnerUp} vs ${rb.primary}`);
  }
});

test("bad photos are rejected with a tip, not guessed at", () => {
  const f = fixtures[0];
  assert.deepEqual(classifyFace([], f.width, f.height).reason, "no-face");
  assert.equal(classifyFace([f.face, f.face], f.width, f.height).reason, "many-faces");
  const small = f.face.map((p) => ({ x: 0.45 + p.x * 0.1, y: 0.45 + p.y * 0.1 }));
  assert.equal(classifyFace([small], f.width, f.height).reason, "too-small");
  const cropped = f.face.map((p) => ({ x: p.x, y: p.y + 0.7 }));
  assert.equal(classifyFace([cropped], f.width, f.height).reason, "cropped");
  const tilted = f.face.map((p) => {
    const a = (50 * Math.PI) / 180, x = p.x * f.width - f.width / 2, y = p.y * f.height - f.height / 2;
    return { x: (f.width / 2 + x * Math.cos(a) - y * Math.sin(a)) / f.width, y: (f.height / 2 + x * Math.sin(a) + y * Math.cos(a)) / f.height };
  });
  // A rotated photo of a level head is a tilted head to the detector; but eyes rotate with it, so roll is measured as 50.
  const r = classifyFace([tilted], f.width, f.height);
  assert.ok(!r.ok && (r.reason === "tilted" || r.reason === "cropped"), String(r.reason));
  const turned = f.face.map((p) => ({ x: p.x + (p.x > 0.5 ? 0 : 0.0) , y: p.y }));
  turned[LM.nose] = { x: f.face[LM.cheekR].x + (f.face[LM.cheekL].x - f.face[LM.cheekR].x) * 0.2, y: f.face[LM.nose].y };
  assert.equal(classifyFace([turned], f.width, f.height).reason, "turned");
  const open = f.face.map((p) => ({ ...p }));
  open[LM.lipBottom] = { x: open[LM.lipBottom].x, y: open[LM.lipTop].y + 0.08 };
  assert.equal(classifyFace([open], f.width, f.height).reason, "mouth-open");
});

test("hair over the forehead: classified from the jaw and cheeks only, with capped confidence", () => {
  const f = fixtures[0];
  const covered = classifyFace([f.face], f.width, f.height, 0.1);
  assert.ok(covered.ok && covered.hairOverForehead && covered.confidence <= 0.5 && covered.level !== "high");
  const m = measure(f.face, f.width, f.height);
  // Changing the (unseen) forehead must not change a hair-covered result.
  const taller = scoreShapes({ ...m, lw: m.lw + 0.3, fw: 0.6, fj: 0.7 }, false);
  assert.deepEqual(taller, scoreShapes(m, false));
});

test("each textbook shape wins on idealised measurements, and scores stay in range", () => {
  const base = { roll: 0, yaw: 0, mouth: 0, size: 0.4, inFrame: true, lw: 1.2, fw: 0.85, jw: 0.82, fj: 1.04, chin: 150, jaw: 129 };
  const cases = {
    oblong: { lw: 1.45, fj: 1.02 },
    round: { lw: 1.08, jaw: 142, chin: 160, jw: 0.92 },
    square: { lw: 1.14, jw: 0.96, jaw: 112, fj: 0.95 },
    heart: { fj: 1.3, jw: 0.7, chin: 130, fw: 0.95 },
    diamond: { fw: 0.74, jw: 0.72, fj: 1.02 },
  };
  for (const [shape, over] of Object.entries(cases)) {
    const s = scoreShapes({ ...base, ...over });
    const top = Object.entries(s).sort((a, b) => b[1] - a[1])[0][0];
    assert.equal(top, shape, JSON.stringify(s));
    for (const v of Object.values(s)) assert.ok(v >= 0 && v <= 1);
  }
});

test("the guide: positive wording only, valid tags, every shape covered", () => {
  for (const s of FACE_SHAPES) {
    const g = FACE_SHAPE_GUIDE[s];
    assert.ok(g.ideas.length >= 2 && g.tags.every((t) => STYLE_TAGS.includes(t)), s);
    assert.ok(!/\b(avoid|never|don't|do not|bad|worst|unflattering)\b/i.test([g.shape, ...g.ideas].join(" ")), `${s} has negative wording`);
  }
  assert.ok(FACE_SHAPE_GUIDE.oval.versatile);
  assert.deepEqual(faceTags(null), []);
});
