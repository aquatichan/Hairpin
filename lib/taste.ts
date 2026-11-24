/**
 * Taste: what the person's own actions say they like, as decaying feature weights. Pure (type-only imports) so it can
 * be tested; lib/taste-store.ts keeps it per account on this device. It is never sent to a server.
 */
import type { Taste } from "./feed";

export type TasteEvent = "open" | "save" | "try" | "board" | "hide";
export const EVENT_WEIGHT: Readonly<Record<TasteEvent, number>> = Object.freeze({ open: 0.6, save: 3, try: 4, board: 3, hide: -3 });

export const TASTE = Object.freeze({ halfLifeDays: 30, negativeHalfLifeDays: 60, maxKeys: 150, maxSeen: 400, maxHidden: 500 });
const DAY = 86_400_000;

export type TasteState = {
  v: 1;
  /** Feature weight and when it was last updated (decay is applied lazily). */
  f: Record<string, { w: number; at: number }>;
  /** Times each look was shown in the feed, and when last. */
  seen: Record<string, { n: number; at: number }>;
  /** "Not for me": look id -> when. */
  hidden: Record<string, number>;
};

export const emptyTaste = (): TasteState => ({ v: 1, f: {}, seen: {}, hidden: {} });

const decayed = (w: number, at: number, now: number) => w * 0.5 ** (Math.max(0, now - at) / ((w < 0 ? TASTE.negativeHalfLifeDays : TASTE.halfLifeDays) * DAY));

/** Records one action on a look described by `keys` (lib/feed.ts featureKeys). Returns a new state. */
export function applyEvent(state: TasteState, event: TasteEvent, keys: readonly string[], now: number, lookId?: string): TasteState {
  const f = { ...state.f };
  // Spread the event over the look's features so a look with many tags doesn't count for more.
  const share = EVENT_WEIGHT[event] / Math.sqrt(Math.max(1, keys.length));
  for (const k of keys) {
    const cur = f[k] ? decayed(f[k].w, f[k].at, now) : 0;
    f[k] = { w: Math.max(-10, Math.min(10, cur + share)), at: now };
  }
  const pruned = Object.entries(f)
    .map(([k, v]) => [k, { w: decayed(v.w, v.at, now), at: now }] as const)
    .filter(([, v]) => Math.abs(v.w) > 0.01)
    .sort((a, b) => Math.abs(b[1].w) - Math.abs(a[1].w))
    .slice(0, TASTE.maxKeys);
  let hidden = state.hidden;
  if (event === "hide" && lookId) hidden = trim({ ...state.hidden, [lookId]: now }, TASTE.maxHidden, (t) => t);
  return { ...state, f: Object.fromEntries(pruned), hidden };
}

/** Undo "Not for me" for one look (its taste signal fades on its own). */
export function unhide(state: TasteState, lookId: string): TasteState {
  const hidden = { ...state.hidden };
  delete hidden[lookId];
  return { ...state, hidden };
}

/** Marks looks as shown once this session. */
export function markSeen(state: TasteState, ids: readonly string[], now: number): TasteState {
  const seen = { ...state.seen };
  for (const id of ids) seen[id] = { n: (seen[id]?.n ?? 0) + 1, at: now };
  return { ...state, seen: trim(seen, TASTE.maxSeen, (s) => s.at) };
}

/** The current weights, for the ranker. */
export function tasteVector(state: TasteState, now: number): Taste {
  const out: Taste = {};
  for (const [k, v] of Object.entries(state.f)) out[k] = decayed(v.w, v.at, now);
  return out;
}

/** Reads a stored value defensively; anything malformed becomes empty. */
export function parseTaste(raw: unknown): TasteState {
  const base = emptyTaste();
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Partial<TasteState>;
  const num = (x: unknown) => typeof x === "number" && Number.isFinite(x);
  for (const [k, v] of Object.entries(r.f ?? {})) if (k.length <= 64 && v && num(v.w) && num(v.at)) base.f[k] = { w: v.w, at: v.at };
  for (const [k, v] of Object.entries(r.seen ?? {})) if (k.length <= 64 && v && num(v.n) && num(v.at)) base.seen[k] = { n: v.n, at: v.at };
  for (const [k, v] of Object.entries(r.hidden ?? {})) if (k.length <= 64 && num(v)) base.hidden[k] = v;
  return base;
}

function trim<V>(rec: Record<string, V>, max: number, at: (v: V) => number): Record<string, V> {
  const entries = Object.entries(rec);
  if (entries.length <= max) return rec;
  return Object.fromEntries(entries.sort((a, b) => at(b[1]) - at(a[1])).slice(0, max));
}
