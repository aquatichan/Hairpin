import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { audienceExcluded, featureKeys, hairTypeAffinity, moreLikeThis, personalKey, rankFeed, scoreItem, similarity } from "../lib/feed.ts";
import { hairTypeAffinity as canonicalAffinity } from "../lib/hair-types.ts";
import { applyEvent, emptyTaste, markSeen, parseTaste, tasteVector, unhide } from "../lib/taste.ts";

const NOW = Date.UTC(2026, 10, 20);
const DAY = 86_400_000;

/** The real catalog, shaped like lib/looks.ts does it. */
function catalog() {
  const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), "utf8"));
  return [...read("../content/gallery.json"), ...read("../content/looks.generated.json")].map((e) => ({
    id: e.id,
    hairType: e.hairType,
    texture: e.texture,
    length: e.length,
    audience: e.audience ?? "any",
    tags: e.tags ?? [],
    faceShapes: e.faceShapes ?? [],
    source: "curated",
    createdAt: Date.UTC(2026, 10, 1),
  }));
}
const ctx = (over = {}) => ({
  hairType: null,
  texture: null,
  length: null,
  lookFor: null,
  faceShape: null,
  faceTags: [],
  taste: {},
  seen: {},
  saved: new Set(),
  hidden: new Set(),
  now: NOW,
  seed: "s1",
  ...over,
});
const ids = (r) => r.map((x) => x.item.id);

test("the private affinity copy matches lib/hair-types.ts for all 144 pairs", () => {
  const types = ["1a", "1b", "1c", "2a", "2b", "2c", "3a", "3b", "3c", "4a", "4b", "4c"];
  for (const a of types) for (const b of types) assert.equal(hairTypeAffinity(a, b), canonicalAffinity(a, b), `${a}/${b}`);
  assert.equal(hairTypeAffinity(null, "1a"), canonicalAffinity(null, "1a"));
});

test("cold start returns every look, deterministically for a seed", () => {
  const items = catalog();
  const a = rankFeed(items, ctx());
  assert.equal(a.length, items.length);
  assert.deepEqual(ids(a), ids(rankFeed(items, ctx())));
  assert.notDeepEqual(ids(a), ids(rankFeed(items, ctx({ seed: "another-session" }))), "a new session varies the order");
});

test("hair type pulls matching looks to the top", () => {
  const top = rankFeed(catalog(), ctx({ hairType: "4c" })).slice(0, 4);
  assert.ok(top.some((r) => r.item.hairType?.[0] === "4"), ids(top).join());
  const first4 = top.find((r) => r.item.hairType === "4c");
  if (first4) assert.ok(first4.reasons.includes("Your hair type"));
});

test("'Show me' leaves out the other audience unless asked, and keeps unisex looks", () => {
  // The catalog may have no unisex looks, so the test brings its own.
  const unisex = { id: "unisex-look", texture: "straight", length: "short", audience: "any", tags: ["buzz"], faceShapes: [], source: "curated", createdAt: Date.UTC(2026, 10, 1) };
  const items = [...catalog(), unisex];
  const men = rankFeed(items, ctx({ lookFor: "men" }));
  assert.ok(men.every((r) => r.item.audience !== "women"));
  assert.ok(men.some((r) => r.item.audience === "any"));
  const women = rankFeed(items, ctx({ lookFor: "women" }));
  assert.ok(women.every((r) => r.item.audience !== "men"));
  assert.equal(rankFeed(items, ctx({ lookFor: "both" })).length, items.length);
  const withOther = rankFeed(items, ctx({ lookFor: "men", showOther: true }));
  assert.equal(withOther.length, items.length);
  const firstWomen = withOther.findIndex((r) => r.item.audience === "women");
  assert.ok(firstWomen > withOther.filter((r) => r.item.audience !== "women").length / 2, "other cuts sink");
  assert.ok(audienceExcluded({ audience: "women" }, { lookFor: "men" }));
  assert.ok(!audienceExcluded({ audience: "any" }, { lookFor: "men" }));
});

test("face shape boosts curated matches and never penalises", () => {
  const items = catalog();
  const look = items.find((i) => i.faceShapes.includes("round"));
  const other = items.find((i) => !i.faceShapes.includes("round"));
  const withFace = ctx({ faceShape: "round", faceTags: ["volume-top", "taper"] });
  assert.ok(scoreItem(look, withFace).parts.face > 0);
  assert.ok(scoreItem(other, withFace).parts.face >= 0);
  assert.equal(scoreItem(look, ctx()).parts.face, 0, "no face shape, no effect");
});

test("taste moves similar looks up; hiding removes a look", () => {
  const items = catalog();
  const target = items.find((i) => i.tags.includes("braids")) ?? items[0];
  let t = emptyTaste();
  for (let i = 0; i < 3; i++) t = applyEvent(t, "save", featureKeys(target), NOW);
  const liked = rankFeed(items, ctx({ taste: tasteVector(t, NOW) }));
  const base = rankFeed(items, ctx());
  const pos = (r, id) => ids(r).indexOf(id);
  const twin = moreLikeThis(target, items, ctx(), 1)[0];
  assert.ok(pos(liked, twin.id) <= pos(base, twin.id), "a look like the saved one doesn't drop");
  const hidden = rankFeed(items, ctx({ hidden: new Set([target.id]) }));
  assert.ok(!ids(hidden).includes(target.id));
});

test("one tap can't swing the feed: taste confidence ramps up", () => {
  const item = catalog()[0];
  const once = applyEvent(emptyTaste(), "open", featureKeys(item), NOW);
  const many = [1, 2, 3, 4, 5].reduce((s) => applyEvent(s, "save", featureKeys(item), NOW), emptyTaste());
  const a = scoreItem(item, ctx({ taste: tasteVector(once, NOW) })).parts.taste;
  const b = scoreItem(item, ctx({ taste: tasteVector(many, NOW) })).parts.taste;
  assert.ok(a > 0 && a < b / 3, `${a} vs ${b}`);
});

test("taste decays and stays bounded", () => {
  const keys = ["t:fade", "x:coily"];
  const t = applyEvent(emptyTaste(), "save", keys, NOW);
  const later = tasteVector(t, NOW + 30 * DAY);
  assert.ok(Math.abs(later["t:fade"] - tasteVector(t, NOW)["t:fade"] / 2) < 1e-9, "30-day half-life");
  let big = emptyTaste();
  for (let i = 0; i < 200; i++) big = applyEvent(big, "try", [`t:k${i}`], NOW);
  assert.ok(Object.keys(big.f).length <= 150);
  assert.deepEqual(parseTaste({ f: { x: { w: "no", at: 1 } }, seen: null }), emptyTaste());
  const h = applyEvent(emptyTaste(), "hide", keys, NOW, "look-a");
  assert.ok(h.hidden["look-a"]);
  assert.ok(!unhide(h, "look-a").hidden["look-a"]);
});

test("seen looks drift down and recover over days", () => {
  const items = catalog();
  const target = rankFeed(items, ctx())[0].item;
  const seen = markSeen(markSeen(emptyTaste(), [target.id], NOW), [target.id], NOW).seen;
  const fresh = scoreItem(target, ctx()).score;
  const now = scoreItem(target, ctx({ seen })).score;
  const later = scoreItem(target, ctx({ seen, now: NOW + 12 * DAY })).score;
  assert.ok(now < fresh && later > now);
});

test("diversity: never more than two in a row with the same texture and length", () => {
  const base = { audience: "any", tags: ["fade"], faceShapes: [], source: "curated", createdAt: NOW };
  const items = [
    ...Array.from({ length: 8 }, (_, i) => ({ ...base, id: `same-${i}`, texture: "coily", length: "short", hairType: "4c" })),
    ...Array.from({ length: 4 }, (_, i) => ({ ...base, id: `other-${i}`, texture: "straight", length: "long", hairType: "1a", tags: ["bun"] })),
  ];
  const r = rankFeed(items, ctx({ hairType: "4c" }));
  const run = (i) => `${r[i].item.texture}|${r[i].item.length}`;
  for (let i = 2; i < 8; i++) assert.ok(!(run(i) === run(i - 1) && run(i) === run(i - 2)), `run at ${i}: ${ids(r).join()}`);
  assert.equal(r.length, items.length, "nothing is dropped");
});

test("community recency and popularity tabs", () => {
  const base = { texture: "wavy", length: "medium", audience: "any", tags: ["waves"], faceShapes: [], source: "community" };
  const items = [
    { ...base, id: "p-old", createdAt: NOW - 40 * DAY, saves: 150 },
    { ...base, id: "p-new", createdAt: NOW - 1 * DAY, saves: 2 },
    { ...base, id: "p-mid", createdAt: NOW - 10 * DAY, saves: 40 },
  ];
  assert.deepEqual(ids(rankFeed(items, ctx(), "new")), ["p-new", "p-mid", "p-old"]);
  assert.deepEqual(ids(rankFeed(items, ctx(), "popular")), ["p-old", "p-mid", "p-new"]);
  assert.ok(scoreItem(items[1], ctx()).reasons.includes("New"));
});

test("similarity is symmetric and 'more like this' excludes the look itself", () => {
  const items = catalog();
  for (const a of items.slice(0, 5)) for (const b of items.slice(0, 5)) assert.equal(similarity(a, b), similarity(b, a));
  const more = moreLikeThis(items[0], items, ctx(), 5);
  assert.equal(more.length, 5);
  assert.ok(!more.some((m) => m.id === items[0].id));
  assert.notEqual(personalKey(ctx({ lookFor: "men" })), personalKey(ctx({ lookFor: "women" })));
});
