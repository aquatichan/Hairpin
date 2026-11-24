import { createHash } from "node:crypto";

/**
 * The caller's IP, for counting free try-ons. On Vercel, x-vercel-forwarded-for / x-real-ip are set by the platform.
 * Elsewhere, put the app behind a proxy that overwrites x-forwarded-for, or a client can claim any address.
 */
export function clientIp(headers: Headers): string | null {
  const pick = (v: string | null) => v?.split(",")[0]?.trim() || null;
  return pick(headers.get("x-vercel-forwarded-for")) ?? pick(headers.get("x-real-ip")) ?? pick(headers.get("x-forwarded-for"));
}

/** One-way, salted: the stored key can't be turned back into an address. */
export const ipHash = (ip: string, salt: string) => createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 40);
