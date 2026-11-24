import "server-only";
import { real } from "./env";

/**
 * Upstash Redis over its REST API: the one server-side store Hairpin already runs (publik install links, render
 * limits, saved-look/board documents). Vercel's Upstash integration sets the KV_ names; a direct Upstash database
 * uses the UPSTASH_ ones. Values are never logged.
 */
const config = (() => {
  const url = real(process.env.KV_REST_API_URL) ?? real(process.env.UPSTASH_REDIS_REST_URL);
  const token = real(process.env.KV_REST_API_TOKEN) ?? real(process.env.UPSTASH_REDIS_REST_TOKEN);
  return url && token ? { url: url.replace(/\/$/, ""), token } : null;
})();

export const redisConfigured = config !== null;

export async function redis<T>(args: (string | number)[]): Promise<T> {
  if (!config) throw new Error("Redis is not configured.");
  const res = await fetch(config.url, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(args.map(String)),
    cache: "no-store",
  });
  const body = (await res.json().catch(() => null)) as { result?: T; error?: string } | null;
  if (!res.ok || !body || body.error) throw new Error("The store did not answer.");
  return body.result as T;
}
