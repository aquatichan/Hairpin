/**
 * The Discover ranker. Pure and deterministic: the same inputs and seed always give the same order, so the grid never
 * reshuffles while someone scrolls, and every position can be explained (`parts`, `reasons`).
 *
 * Type-only imports so `node --test` can load this file directly; `hairTypeAffinity` is a private copy of the one in
 * lib/hair-types.ts, kept equal by a parity test.
 */
import type { HairType } from "./hair-types";
import type { Audience, FaceShape, LookFor, LookSource } from "./style";

export type FeedItem = {
  id: string;
  hairType?: HairType;
  texture: "straight" | "wavy" | "curly" | "coily";
  length: "short" | "medium" | "long";
  audience: Audience;
  tags: readonly string[];
  faceShapes: readonly FaceShape[];
  source: LookSource;
  createdAt: number;
  saves?: number;
  /** Community posts: one uploader shouldn't fill the screen. */
  owner?: string;
};

/** Feature weights learned from what the person does, keyed by `featureKeys`. Negative = less of this. */
export type Taste = Record<string, number>;

export type FeedContext = {
  hairType: HairType | null;
  texture: FeedItem["texture"] | null;
  length: FeedItem["length"] | null;
  lookFor: LookFor | null;
  /** A confirmed face shape (never an unconfirmed scan). */
  faceShape: FaceShape | null;
  /** Tags often recommended for that face shape (lib/face-shape-guide.ts). */
  faceTags: readonly string[];
  taste: Taste;
  /** Times shown and when last shown, per look. */
  seen: Record<string, { n: number; at: number }>;
  saved: ReadonlySet<string>;
  hidden: ReadonlySet<string>;
  now: number;
  /** One per feed session: varies the order between visits, stable within one. */
  seed: string;
  /** Show cuts outside "Show me" too, pushed down. */
  showOther?: boolean;
};

export type FeedTab = "for-you" | "new" | "popular";
export type Ranked<T extends FeedItem> = { item: T; score: number; parts: Record<string, number>; reasons: string[]; explore: boolean };

export const WEIGHTS = Object.freeze({
  hairType: 30,
  taste: 22,
  recency: 10,
  face: 9,
  audience: 9,
  popularity: 8,
  length: 6,
  seen: -30,
  saved: -12,
  otherAudience: -25,
  jitter: 2.5,
});
export const FEED = Object.freeze({
  lambda: 0.72,
  maxRun: 2,
  exploreEvery: 6,
  recencyHalfLifeDays: 14,
  seenHalfLifeDays: 4,
  popularityCap: 200,
  preFilter: 300,
  /** Taste confidence reaches 1 at this much accumulated signal. */
  tasteRamp: 8,
});

const DAY = 86_400_000;
const LENGTH_ORDER = { short: 0, medium: 1, long: 2 } as const;
const FAMILY_TEXTURE = { "1": "straight", "2": "wavy", "3": "curly", "4": "coily" } as const;

/** Same as lib/hair-types.ts: 3 same type, 2 same family, 1 neighbouring family, 0 otherwise. */
export function hairTypeAffinity(a: HairType | null | undefined, b: HairType | null | undefined): number {
  if (!a || !b) return 0;
  if (a === b) return 3;
  const d = Math.abs(Number(a[0]) - Number(b[0]));
  return d === 0 ? 2 : d === 1 ? 1 : 0;
}

/** The features a look is made of, shared by taste, similarity and diversity. */
export function featureKeys(item: FeedItem): string[] {
  const keys = [`x:${item.texture}`, `l:${item.length}`, `a:${item.audience}`, ...item.tags.map((t) => `t:${t}`)];
  if (item.hairType) keys.push(`h:${item.hairType}`, `f:${item.hairType[0]}`);
  return keys;
}

// ---- seeded randomness ---------------------------------------------------------------------------------------------

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
/** A number in [0, 1) fixed by the seed and key. */
export const seeded = (seed: string, key: string) => {
  let t = (hash(`${seed}|${key}`) + 0x6d2b79f5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// ---- scoring -------------------------------------------------------------------------------------------------------

/** Whether "Show me" hides this look outright. */
export function audienceExcluded(item: FeedItem, ctx: Pick<FeedContext, "lookFor" | "showOther">): boolean {
  if (!ctx.lookFor || ctx.lookFor === "both" || item.audience === "any") return false;
  return item.audience !== ctx.lookFor && !ctx.showOther;
}

function tasteSimilarity(item: FeedItem, taste: Taste): { sim: number; confidence: number } {
  const keys = featureKeys(item);
  let dot = 0;
  let norm = 0;
  let total = 0;
  for (const v of Object.values(taste)) {
    norm += v * v;
    total += Math.abs(v);
  }
  if (!norm) return { sim: 0, confidence: 0 };
  for (const k of keys) dot += taste[k] ?? 0;
  const sim = dot / (Math.sqrt(keys.length) * Math.sqrt(norm));
  return { sim: Math.max(-1, Math.min(1, sim)), confidence: Math.min(1, total / FEED.tasteRamp) };
}

export function scoreItem<T extends FeedItem>(item: T, ctx: FeedContext): Ranked<T> {
  const parts: Record<string, number> = {};
  const reasons: string[] = [];

  // Hair type, falling back to texture when either side has no type.
  const aff = hairTypeAffinity(ctx.hairType, item.hairType);
  let hair = aff / 3;
  if (!aff && (!ctx.hairType || !item.hairType)) {
    const mine = ctx.texture ?? (ctx.hairType ? FAMILY_TEXTURE[ctx.hairType[0] as "1"] : null);
    if (mine && mine === item.texture) hair = 0.67;
  }
  parts.hairType = WEIGHTS.hairType * hair;
  if (aff === 3) reasons.push("Your hair type");
  else if (hair >= 0.6) reasons.push("Close to your hair type");

  const { sim, confidence } = tasteSimilarity(item, ctx.taste);
  parts.taste = WEIGHTS.taste * sim * confidence;
  if (parts.taste > WEIGHTS.taste * 0.3) reasons.push("Like looks you've saved");

  const ageDays = Math.max(0, (ctx.now - item.createdAt) / DAY);
  parts.recency = WEIGHTS.recency * (item.source === "curated" ? 0.5 : 0.5 ** (ageDays / FEED.recencyHalfLifeDays));
  if (item.source !== "curated" && ageDays < 3) reasons.push("New");

  let face = 0;
  if (ctx.faceShape) {
    if (item.faceShapes.includes(ctx.faceShape)) face = 1;
    else if (item.source === "curated" || !item.faceShapes.length) {
      const hits = item.tags.filter((t) => ctx.faceTags.includes(t)).length;
      face = Math.min(0.6, hits * 0.3);
    }
  }
  parts.face = WEIGHTS.face * face;
  if (face >= 0.6 && ctx.faceShape) reasons.push(`Often picked for ${ctx.faceShape} faces`);

  if (ctx.lookFor && ctx.lookFor !== "both") {
    if (item.audience === ctx.lookFor) parts.audience = WEIGHTS.audience;
    else if (item.audience === "any") parts.audience = WEIGHTS.audience * 0.7;
    else parts.audience = WEIGHTS.otherAudience;
  } else parts.audience = 0;

  const saves = Math.min(item.saves ?? 0, FEED.popularityCap);
  parts.popularity = (WEIGHTS.popularity * Math.log1p(saves)) / Math.log1p(FEED.popularityCap);
  if (saves >= 25) reasons.push("Popular");

  parts.length = ctx.length ? WEIGHTS.length * (item.length === ctx.length ? 1 : Math.abs(LENGTH_ORDER[item.length] - LENGTH_ORDER[ctx.length]) === 1 ? 0.4 : 0) : 0;
  if (ctx.length && item.length === ctx.length) reasons.push(`Works at ${ctx.length} length`);

  const s = ctx.seen[item.id];
  const exposure = s ? Math.min(1, s.n * 0.35) * 0.5 ** (Math.max(0, ctx.now - s.at) / (FEED.seenHalfLifeDays * DAY)) : 0;
  parts.seen = WEIGHTS.seen * exposure;
  parts.saved = ctx.saved.has(item.id) ? WEIGHTS.saved : 0;
  parts.jitter = WEIGHTS.jitter * (seeded(ctx.seed, item.id) * 2 - 1);

  const score = Object.values(parts).reduce((a, b) => a + b, 0);
  return { item, score, parts, reasons: reasons.slice(0, 2), explore: false };
}

// ---- similarity ----------------------------------------------------------------------------------------------------

function jaccard(a: readonly string[], b: readonly string[]): number {
  if (!a.length && !b.length) return 0;
  const sb = new Set(b);
  const inter = a.filter((x) => sb.has(x)).length;
  return inter / (a.length + b.length - inter);
}

/** Symmetric 0..1 likeness of two looks, for "More like this" and diversity. */
export function similarity(a: FeedItem, b: FeedItem): number {
  const hair = a.hairType && b.hairType ? hairTypeAffinity(a.hairType, b.hairType) / 3 : a.texture === b.texture ? 0.67 : 0;
  const len = a.length === b.length ? 1 : Math.abs(LENGTH_ORDER[a.length] - LENGTH_ORDER[b.length]) === 1 ? 0.4 : 0;
  const aud = a.audience === b.audience ? 1 : a.audience === "any" || b.audience === "any" ? 0.5 : 0;
  return 0.3 * hair + 0.35 * jaccard(a.tags, b.tags) + 0.15 * len + 0.1 * jaccard(a.faceShapes, b.faceShapes) + 0.1 * aud;
}

const runKey = (i: FeedItem) => `${i.texture}|${i.length}`;

// ---- ranking -------------------------------------------------------------------------------------------------------

/**
 * Orders the feed. Hidden looks and (unless `showOther`) looks outside "Show me" are left out. "For you" is
 * score-ranked, then diversified (greedy MMR, at most `maxRun` in a row sharing texture and length or uploader), with
 * one exploration pick about every `exploreEvery` places. "New" and "Popular" sort by date or saves first.
 */
export function rankFeed<T extends FeedItem>(items: readonly T[], ctx: FeedContext, tab: FeedTab = "for-you"): Ranked<T>[] {
  const scored = items.filter((i) => !ctx.hidden.has(i.id) && !audienceExcluded(i, ctx)).map((i) => scoreItem(i, ctx));

  if (tab === "new") {
    const day = (r: Ranked<T>) => Math.floor(r.item.createdAt / DAY);
    return scored.sort((a, b) => day(b) - day(a) || b.score - a.score || a.item.id.localeCompare(b.item.id));
  }
  if (tab === "popular") {
    return scored.sort((a, b) => (b.item.saves ?? 0) - (a.item.saves ?? 0) || b.score - a.score || a.item.id.localeCompare(b.item.id));
  }

  scored.sort((a, b) => b.score - a.score || a.item.id.localeCompare(b.item.id));
  const pool = scored.slice(0, FEED.preFilter);
  const tail = scored.slice(FEED.preFilter);
  if (!pool.length) return [];

  const max = pool[0].score;
  const min = pool[pool.length - 1].score;
  const norm = (s: number) => (max === min ? 1 : (s - min) / (max - min));
  const median = pool[Math.floor(pool.length / 2)].score;

  const out: Ranked<T>[] = [];
  const left = [...pool];
  while (left.length) {
    const pos = out.length;
    const recent = out.slice(-3).map((r) => r.item);
    const run = out.slice(-FEED.maxRun);
    const breaksRun = (c: Ranked<T>) =>
      run.length === FEED.maxRun &&
      (run.every((r) => runKey(r.item) === runKey(c.item)) || (c.item.owner !== undefined && run.every((r) => r.item.owner === c.item.owner)));

    let pick = -1;
    let explored = false;
    // Exploration: an unseen, reasonably relevant look that differs from what's just above it.
    if (pos > 0 && (pos + 1) % FEED.exploreEvery === 0) {
      const options = left
        .map((c, i) => ({ c, i }))
        .filter(({ c }) => !ctx.seen[c.item.id] && c.score >= median && !breaksRun(c) && recent.every((r) => similarity(r, c.item) < 0.5));
      if (options.length) {
        pick = options[Math.floor(seeded(ctx.seed, `explore:${pos}`) * options.length)].i;
        explored = true;
      }
    }
    if (pick < 0) {
      let best = -Infinity;
      for (let i = 0; i < left.length; i++) {
        const c = left[i];
        if (breaksRun(c)) continue;
        const redundancy = recent.length ? Math.max(...recent.map((r) => similarity(r, c.item))) : 0;
        const v = FEED.lambda * norm(c.score) - (1 - FEED.lambda) * redundancy;
        if (v > best) {
          best = v;
          pick = i;
        }
      }
    }
    if (pick < 0) pick = 0; // every remaining look would break the run rule: accept it rather than drop it
    const [chosen] = left.splice(pick, 1);
    out.push({ ...chosen, explore: explored });
  }
  return [...out, ...tail];
}

/** Looks most like `target`, best first; ties go to the personal score. */
export function moreLikeThis<T extends FeedItem>(target: FeedItem, items: readonly T[], ctx: FeedContext, n = 8): T[] {
  return items
    .filter((i) => i.id !== target.id && !ctx.hidden.has(i.id) && !audienceExcluded(i, ctx))
    .map((i) => ({ i, sim: similarity(target, i), score: scoreItem(i, ctx).score }))
    .sort((a, b) => b.sim - a.sim || b.score - a.score || a.i.id.localeCompare(b.i.id))
    .slice(0, n)
    .map((x) => x.i);
}

/** Inputs that, when changed, should re-rank the feed behind the loading moment. */
export const personalKey = (c: Pick<FeedContext, "hairType" | "texture" | "length" | "lookFor" | "faceShape">) =>
  [c.hairType ?? "", c.texture ?? "", c.length ?? "", c.lookFor ?? "", c.faceShape ?? ""].join("|");
