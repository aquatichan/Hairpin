import "server-only";
import { curatedIds } from "./looks";
import { isKeepableLookId } from "./style";
import { sanitizeLibrary, type Library } from "./library-model";
import { redis, redisConfigured } from "./redis.server";

/**
 * Where each account's saved looks and boards live: one JSON document per Firebase uid, `hairpin:library:<uid>`, in
 * the Upstash store Hairpin already runs. It holds look IDs, board names and timestamps; never images or briefs.
 * Local development without Redis keeps documents in this process's memory. Production without Redis has no sync.
 */
const memory = new Map<string, string>();
const key = (uid: string) => `hairpin:library:${uid}`;

export const librarySyncAvailable = () => redisConfigured || process.env.NODE_ENV !== "production";

/** Curated IDs must exist; private (m-) and community (p-) IDs are kept even if this build can't resolve them. */
export const isKnownLook = (id: string) => isKeepableLookId(id, curatedIds);

export async function readLibrary(uid: string): Promise<Library | null> {
  const raw = redisConfigured ? await redis<string | null>(["GET", key(uid)]) : (memory.get(key(uid)) ?? null);
  if (!raw) return null;
  try {
    return sanitizeLibrary(JSON.parse(raw), isKnownLook);
  } catch {
    return null;
  }
}

export async function writeLibrary(uid: string, library: Library, ttlS?: number) {
  const raw = JSON.stringify(library);
  if (redisConfigured) await redis(ttlS ? ["SET", key(uid), raw, "EX", ttlS] : ["SET", key(uid), raw]);
  else {
    memory.set(key(uid), raw);
    if (ttlS) setTimeout(() => memory.delete(key(uid)), ttlS * 1000).unref?.();
  }
}

export async function deleteLibrary(uid: string) {
  if (redisConfigured) await redis(["DEL", key(uid)]);
  else memory.delete(key(uid));
}
