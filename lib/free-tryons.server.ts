import "server-only";
import { isVendor, type Vendor } from "./ai-vendors";
import { clientIp, ipHash } from "./client-ip";
import { real } from "./env";
import { FREE_PER_IP, freeRemaining, reserveFreeTryon } from "./guards";
import { memoryKv, redisKv } from "./kv";
import { redis, redisConfigured } from "./redis.server";

/**
 * Free try-ons, paid by the app: FREE_PER_IP per IP address, and at most a daily ceiling across everyone.
 *
 * Configure on the server only (never NEXT_PUBLIC):
 *   HAIRPIN_FREE_PROVIDER   openai | gemini        which provider the app's key belongs to
 *   HAIRPIN_FREE_API_KEY    the app's key for that provider
 *   HAIRPIN_FREE_DAILY_CAP  most free try-ons per UTC day for the whole app (default 50)
 *   HAIRPIN_IP_SALT         secret salt for hashing IPs (falls back to PUBLIK_INSTALL_SECRET)
 * Without all of these, or without Redis in production, free try-ons are off.
 *
 * IP addresses are never stored: only a salted SHA-256 of the address, `hairpin:free:ip:<hash>`, holding a count that
 * expires after a year. A try-on is reserved before the provider call and refunded if it fails.
 */

type Config = { vendor: Vendor; apiKey: string; dailyCap: number; monthlyCap: number; salt: string };

function config(): Config | null {
  const vendor = process.env.HAIRPIN_FREE_PROVIDER?.trim();
  const apiKey = real(process.env.HAIRPIN_FREE_API_KEY);
  const salt = real(process.env.HAIRPIN_IP_SALT) ?? real(process.env.PUBLIK_INSTALL_SECRET) ?? (process.env.NODE_ENV !== "production" ? "development-only-salt" : null);
  // Free try-ons always do reference matching, so only providers with verified two-image edits qualify.
  if (!isVendor(vendor) || vendor === "openrouter" || vendor === "anthropic" || !apiKey || !salt) return null;
  if (process.env.NODE_ENV === "production" && !redisConfigured) return null;
  const cap = Number(process.env.HAIRPIN_FREE_DAILY_CAP);
  const mcap = Number(process.env.HAIRPIN_FREE_MONTHLY_CAP);
  return { vendor, apiKey, dailyCap: Number.isInteger(cap) && cap > 0 ? cap : 50, monthlyCap: Number.isInteger(mcap) && mcap > 0 ? mcap : 1000, salt };
}

/** Demo mode (PUBLIK_MOCK) counts free try-ons without a provider key, so the flow can be tested end to end. */
function mockConfig(): Config {
  return { vendor: "openai", apiKey: "mock", dailyCap: 50, monthlyCap: 1000, salt: "development-only-salt" };
}

const kv = redisConfigured ? redisKv(redis) : memoryKv();
const ipKey = (headers: Headers, salt: string) => ipHash(clientIp(headers) ?? "unknown", salt);

export type FreeStatus = { enabled: boolean; remaining: number; perIp: number; vendor: Vendor | null };

export async function freeStatus(headers: Headers, mock = false): Promise<FreeStatus> {
  const c = mock ? mockConfig() : config();
  if (!c) return { enabled: false, remaining: 0, perIp: FREE_PER_IP, vendor: null };
  try {
    return { enabled: true, remaining: await freeRemaining(kv, ipKey(headers, c.salt)), perIp: FREE_PER_IP, vendor: c.vendor };
  } catch {
    return { enabled: false, remaining: 0, perIp: FREE_PER_IP, vendor: c.vendor };
  }
}

export type FreeTicket =
  | { ok: true; vendor: Vendor; apiKey: string; remaining: number; refund: () => Promise<void> }
  | { ok: false; status: 402 | 429 | 503; code: "free_used" | "free_busy" | "free_unavailable"; message: string };

/** Reserves one free try-on for this IP, within today's ceiling (logic in lib/guards.ts). */
export async function reserveFree(headers: Headers, mock = false): Promise<FreeTicket> {
  const c = mock ? mockConfig() : config();
  if (!c) return { ok: false, status: 503, code: "free_unavailable", message: "Free try-ons aren't available right now. Use a publik plan or your own key." };
  const r = await reserveFreeTryon(kv, ipKey(headers, c.salt), c.dailyCap, Date.now(), c.monthlyCap);
  return r.ok ? { ...r, vendor: c.vendor, apiKey: c.apiKey } : r;
}
