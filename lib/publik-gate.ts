import "server-only";
import { errorResponse } from "./api-error";
import type { AiProvider } from "./ai";
import { real } from "./env";
import { ensureUser, resolveProvider, trackActive, useStore as setPublikStore, type PublikStore, type PublikUser, type UserState } from "./publik.server";
import { verifyCaller } from "./server-auth";

/**
 * The server half of the gate. Google sign-in (Firebase) says who the person
 * is; the publik module then creates that person's publik install on its own
 * and keeps it linked to their Google uid. Every AI route calls
 * requireMember() before doing any work, so the API can't be used to skip the
 * gate the app shell shows.
 */

/** Upstash Redis over its REST API. Vercel's Upstash integration sets the KV_ names; a direct Upstash database uses the UPSTASH_ ones. */
const redis = (() => {
  const url = real(process.env.KV_REST_API_URL) ?? real(process.env.UPSTASH_REDIS_REST_URL);
  const token = real(process.env.KV_REST_API_TOKEN) ?? real(process.env.UPSTASH_REDIS_REST_TOKEN);
  return url && token ? { url: url.replace(/\/$/, ""), token } : null;
})();

async function command<T>(args: string[]): Promise<T> {
  const res = await fetch(redis!.url, {
    method: "POST",
    headers: { Authorization: `Bearer ${redis!.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
    cache: "no-store",
  });
  const body = (await res.json().catch(() => null)) as { result?: T; error?: string } | null;
  if (!res.ok || !body || body.error) throw new Error("The publik store did not answer.");
  return body.result as T;
}

const key = (userId: string) => `publik:user:${userId}`;
const redisStore: PublikStore = {
  async get(userId) {
    const raw = await command<string | null>(["GET", key(userId)]);
    return raw ? (JSON.parse(raw) as PublikUser) : null;
  },
  async set(userId, user) {
    await command(["SET", key(userId), JSON.stringify(user)]);
  },
  async delete(userId) {
    await command(["DEL", key(userId)]);
  },
};

// The module's memory store loses every record when a serverless instance ends, so production needs Redis.
if (redis) setPublikStore(redisStore);

const hasToken = () => (process.env.PUBLIK_APP_TOKEN?.trim() ?? "").startsWith("pat_");
const hasSecret = () => (real(process.env.PUBLIK_INSTALL_SECRET)?.length ?? 0) >= 32; // a PLACEHOLDER_[...] is long enough to pass a length check alone

/** True once the server has the app token, the install secret, and somewhere durable to keep people's records. */
export const gateConfigured = () => hasToken() && hasSecret() && (redis !== null || process.env.NODE_ENV !== "production");

export type GateStatus = UserState | { state: "not_connected"; message: string } | { state: "signed_out" };

const NOT_CONNECTED = "Sign in with publik isn't connected in this build yet.";

/** What the gate screen needs for the person making this request. */
export async function gateStatus(request: Request): Promise<GateStatus> {
  const userId = await verifyCaller(request);
  if (!userId) return { state: "signed_out" };
  if (!gateConfigured()) return { state: "not_connected", message: NOT_CONNECTED };
  const state = await ensureUser(userId);
  if (state.state === "claimed") void trackActive(userId);
  return state;
}

/** The person's own OpenAI key, when they chose "Use my own key". It is used for this one request and never stored on the server. */
function ownKeyFrom(request: Request) {
  const apiKey = request.headers.get("x-hairpin-own-key")?.trim();
  return apiKey ? { baseURL: "https://api.openai.com/v1", apiKey } : null;
}

type Member = { ok: true; userId: string; provider: AiProvider } | { ok: false; response: Response };

/** Google sign-in, then Sign in with publik, then the key this person's AI call runs on. */
export async function requireMember(request: Request): Promise<Member> {
  const userId = await verifyCaller(request);
  if (!userId) return { ok: false, response: errorResponse(401, { code: "signed_out", message: "Please sign in again." }) };
  if (!gateConfigured()) return { ok: false, response: errorResponse(503, { code: "not_connected", message: NOT_CONNECTED }) };

  const state = await ensureUser(userId);
  if (state.state === "unreachable") return { ok: false, response: errorResponse(503, { code: "publik_unreachable", message: state.message }) };
  if (state.state === "sign_in") {
    return { ok: false, response: errorResponse(403, { code: "publik_sign_in", message: "Please sign in with publik to continue." }) };
  }
  void trackActive(userId);

  const provider = await resolveProvider(userId, ownKeyFrom(request));
  if (provider.kind === "own") return { ok: true, userId, provider: { kind: "own", apiKey: provider.apiKey } };
  if (provider.kind === "publik") return { ok: true, userId, provider: { kind: "publik", apiKey: provider.apiKey } };
  return { ok: false, response: errorResponse(403, { code: "publik_sign_in", message: "Please sign in with publik to continue." }) };
}
