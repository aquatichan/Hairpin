import "server-only";
import { DEFAULT_ALLOWANCE, allowanceKeys, reserveAllowance as reserve, takeRenderTicket as take, type RenderTicket } from "./guards";
import { memoryKv, redisKv } from "./kv";
import { redis, redisConfigured } from "./redis.server";

/**
 * Cost guard for paid renders (logic in lib/guards.ts): one render in flight per person and a cap per 10 minutes.
 * With Upstash configured (production) the lock and counter are shared by every server instance; without it (local
 * development) they live in this instance's memory. If Redis is configured but doesn't answer, renders are refused.
 */
const kv = redisConfigured ? redisKv(redis) : memoryKv();

export type Ticket = RenderTicket;
export const takeRenderTicket = (uid: string, nowMs = Date.now()) => take(kv, uid, nowMs);

const limit = (v: string | undefined, d: number) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : d;
};
/** Per-account daily and monthly try-on allowance (lib/guards.ts). */
export const reserveAllowance = (uid: string, nowMs = Date.now()) =>
  reserve(kv, uid, { daily: limit(process.env.HAIRPIN_DAILY_TRYONS, DEFAULT_ALLOWANCE.daily), monthly: limit(process.env.HAIRPIN_MONTHLY_TRYONS, DEFAULT_ALLOWANCE.monthly) }, nowMs);

/** Account deletion: this person's lock and counters for the current day, month and render window. */
export async function deleteRenderRecords(uid: string, nowMs = Date.now()) {
  const { day, month } = allowanceKeys(uid, nowMs);
  const window = Math.floor(nowMs / 1000 / 600);
  for (const key of [`hairpin:render:lock:${uid}`, `hairpin:render:n:${uid}:${window}`, `hairpin:render:n:${uid}:${window - 1}`, day, month]) await kv.del(key);
}
