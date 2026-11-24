import type { Kv } from "./kv";

/**
 * The cost guards' logic over any Kv (lib/kv.ts). Server wiring: lib/render-guard.server.ts, lib/free-tryons.server.ts.
 * If the store fails, every guard refuses rather than letting an unguarded paid call through.
 */

/* ---------- renders: one at a time per person, a cap per window ---------- */

export const RENDER_WINDOW_S = 10 * 60;
export const RENDER_LOCK_S = 180; // longer than any provider call; frees itself if an instance dies mid-render
export const RENDERS_PER_WINDOW = 12;

export type RenderTicket =
  | { ok: true; release: () => Promise<void> }
  | { ok: false; status: 429 | 503; code: "render_in_progress" | "rate_limited" | "guard_unavailable"; message: string; retryAfter: number };

export async function takeRenderTicket(kv: Kv, uid: string, nowMs: number): Promise<RenderTicket> {
  const lock = `hairpin:render:lock:${uid}`;
  const counter = `hairpin:render:n:${uid}:${Math.floor(nowMs / 1000 / RENDER_WINDOW_S)}`;
  try {
    if (!(await kv.setNx(lock, RENDER_LOCK_S))) {
      return { ok: false, status: 429, code: "render_in_progress", message: "A try-on is already being made. Wait for it to finish.", retryAfter: 10 };
    }
    const count = await kv.incr(counter, RENDER_WINDOW_S + 5);
    if (count > RENDERS_PER_WINDOW) {
      await kv.decr(counter);
      await kv.del(lock);
      const retryAfter = RENDER_WINDOW_S - (Math.floor(nowMs / 1000) % RENDER_WINDOW_S);
      return { ok: false, status: 429, code: "rate_limited", message: `That's a lot of try-ons in a short time. Try again in ${Math.max(1, Math.ceil(retryAfter / 60))} min.`, retryAfter };
    }
    let released = false;
    return {
      ok: true,
      release: async () => {
        if (released) return;
        released = true;
        await kv.del(lock).catch(() => {}); // expires on its own if this fails
      },
    };
  } catch {
    return { ok: false, status: 503, code: "guard_unavailable", message: "Hairpin can't start a try-on right now. Please try again in a moment.", retryAfter: 15 };
  }
}

/* ---------- allowance: a daily and monthly cap per account, whatever pays ---------- */

/**
 * The burst limit above only paces requests; this caps the total. Counted per account per UTC day and month, reserved
 * before the provider call and refunded if it fails. Limits come from HAIRPIN_DAILY_TRYONS / HAIRPIN_MONTHLY_TRYONS.
 */
export type Allowance = { daily: number; monthly: number };
export const DEFAULT_ALLOWANCE: Allowance = { daily: 30, monthly: 300 };

export type AllowanceReservation =
  | { ok: true; refund: () => Promise<void> }
  | { ok: false; status: 429 | 503; code: "allowance_reached" | "guard_unavailable"; message: string };

export const allowanceKeys = (uid: string, nowMs: number) => {
  const iso = new Date(nowMs).toISOString();
  return { day: `hairpin:allow:d:${uid}:${iso.slice(0, 10)}`, month: `hairpin:allow:m:${uid}:${iso.slice(0, 7)}` };
};

export async function reserveAllowance(kv: Kv, uid: string, limits: Allowance, nowMs: number): Promise<AllowanceReservation> {
  const { day, month } = allowanceKeys(uid, nowMs);
  try {
    const d = await kv.incr(day, 2 * 24 * 3600);
    const m = await kv.incr(month, 32 * 24 * 3600);
    if (d > limits.daily || m > limits.monthly) {
      await Promise.all([kv.decr(day), kv.decr(month)]);
      const which = m > limits.monthly ? `this month's ${limits.monthly}` : `today's ${limits.daily}`;
      return { ok: false, status: 429, code: "allowance_reached", message: `You've reached ${which} try-ons. This limit keeps costs in check; it resets ${m > limits.monthly ? "next month" : "tomorrow"}.` };
    }
    let refunded = false;
    return {
      ok: true,
      refund: async () => {
        if (refunded) return;
        refunded = true;
        await Promise.all([kv.decr(day), kv.decr(month)]).catch(() => {});
      },
    };
  } catch {
    return { ok: false, status: 503, code: "guard_unavailable", message: "Hairpin can't start a try-on right now. Please try again in a moment." };
  }
}

/* ---------- free try-ons: a few per IP hash, a ceiling per day and month ---------- */

export const FREE_PER_IP = 3;
const IP_TTL_S = 365 * 24 * 3600;

export type FreeReservation =
  | { ok: true; remaining: number; refund: () => Promise<void> }
  | { ok: false; status: 402 | 429 | 503; code: "free_used" | "free_busy" | "free_unavailable"; message: string };

export async function reserveFreeTryon(kv: Kv, ipHashKey: string, dailyCap: number, nowMs: number, monthlyCap = Infinity): Promise<FreeReservation> {
  const ip = `hairpin:free:ip:${ipHashKey}`;
  const day = `hairpin:free:day:${new Date(nowMs).toISOString().slice(0, 10)}`;
  const month = `hairpin:free:month:${new Date(nowMs).toISOString().slice(0, 7)}`;
  try {
    const used = await kv.incr(ip, IP_TTL_S);
    if (used > FREE_PER_IP) {
      await kv.decr(ip);
      return { ok: false, status: 402, code: "free_used", message: `You've used your ${FREE_PER_IP} free try-ons. Keep going with a publik plan (7-day free trial) or your own key.` };
    }
    const today = await kv.incr(day, 2 * 24 * 3600);
    const thisMonth = await kv.incr(month, 32 * 24 * 3600);
    if (today > dailyCap || thisMonth > monthlyCap) {
      await Promise.all([kv.decr(ip), kv.decr(day), kv.decr(month)]);
      return { ok: false, status: 429, code: "free_busy", message: "The free try-ons are all taken for now. Try again later, or use a publik plan or your own key." };
    }
    let refunded = false;
    return {
      ok: true,
      remaining: FREE_PER_IP - used,
      refund: async () => {
        if (refunded) return;
        refunded = true;
        await Promise.all([kv.decr(ip), kv.decr(day), kv.decr(month)]).catch(() => {});
      },
    };
  } catch {
    return { ok: false, status: 503, code: "free_unavailable", message: "Free try-ons aren't available right now. Please try again in a moment." };
  }
}

export async function freeRemaining(kv: Kv, ipHashKey: string): Promise<number> {
  return Math.max(0, FREE_PER_IP - (await kv.get(`hairpin:free:ip:${ipHashKey}`)));
}
