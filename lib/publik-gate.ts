import "server-only";
import { errorResponse } from "./api-error";
import type { AiProvider } from "./ai";
import { isVendor, type Vendor } from "./ai-vendors";
import { real } from "./env";
import { redis, redisConfigured } from "./redis.server";
import { ensureUser, resolveProvider, trackActive, useStore as setPublikStore, type PublikStore, type PublikUser, type UserState } from "./publik.server";
import { verifyCaller } from "./server-auth";

/**
 * The server half of the gate. Google sign-in (Firebase) says who the person
 * is; the publik module then creates that person's publik install on its own
 * and keeps it linked to their Google uid. Every AI route calls
 * requireMember() before doing any work, so the API can't be used to skip the
 * gate the app shell shows.
 */

const key = (userId: string) => `publik:user:${userId}`;
const redisStore: PublikStore = {
  async get(userId) {
    const raw = await redis<string | null>(["GET", key(userId)]);
    return raw ? (JSON.parse(raw) as PublikUser) : null;
  },
  async set(userId, user) {
    await redis(["SET", key(userId), JSON.stringify(user)]);
  },
  async delete(userId) {
    await redis(["DEL", key(userId)]);
  },
};

/** Account deletion: forget this person's link to their publik install (the install itself lives at publik). */
export async function deletePublikRecord(userId: string) {
  if (redisConfigured) await redisStore.delete(userId);
}

// The module's memory store loses every record when a serverless instance ends, so production needs Redis.
if (redisConfigured) setPublikStore(redisStore);

const hasToken = () => (process.env.PUBLIK_APP_TOKEN?.trim() ?? "").startsWith("pat_");
const hasSecret = () => (real(process.env.PUBLIK_INSTALL_SECRET)?.length ?? 0) >= 32; // a PLACEHOLDER_[...] is long enough to pass a length check alone

/** True once the server has the app token, the install secret, and somewhere durable to keep people's records. */
export const gateConfigured = () => hasToken() && hasSecret() && (redisConfigured || process.env.NODE_ENV !== "production");

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

/** The person's own key and its provider, when they chose "Use my own key". Used for this one request, never stored. */
function ownKeyFrom(request: Request) {
  const apiKey = request.headers.get("x-hairpin-own-key")?.trim();
  if (!apiKey) return null;
  const v = request.headers.get("x-hairpin-own-vendor")?.trim();
  // Clients from before other providers existed sent OpenAI keys without naming the provider.
  const vendor: Vendor = isVendor(v) ? v : "openai";
  return { vendor, apiKey };
}

/** The person chose the app's free try-ons (lib/free-tryons.server.ts); the try-on route reserves one per request. */
export const wantsFree = (request: Request) => request.headers.get("x-hairpin-free") === "1";

type Member =
  | { ok: true; userId: string; free: false; provider: AiProvider }
  | { ok: true; userId: string; free: true }
  | { ok: false; response: Response };

/** Google sign-in, then Sign in with publik, then the key this person's AI call runs on (or the free try-ons). */
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

  const own = ownKeyFrom(request);
  if (!own && wantsFree(request)) return { ok: true, userId, free: true };
  const provider = await resolveProvider(userId, own ? { baseURL: "", apiKey: own.apiKey } : null);
  if (provider.kind === "own" && own) return { ok: true, userId, free: false, provider: { kind: "own", vendor: own.vendor, apiKey: provider.apiKey } };
  if (provider.kind === "publik") return { ok: true, userId, free: false, provider: { kind: "publik", apiKey: provider.apiKey } };
  return { ok: false, response: errorResponse(403, { code: "publik_sign_in", message: "Please sign in with publik to continue." }) };
}

/** For Decode and Briefs: free try-ons don't cover them. */
export async function requireKeyedMember(request: Request) {
  const member = await requireMember(request);
  if (member.ok && member.free) {
    return { ok: false as const, response: errorResponse(403, { code: "free_tryons_only", message: "Free try-ons cover try-ons only. Decode and Barber Briefs need a publik plan or your own key." }) };
  }
  return member;
}
