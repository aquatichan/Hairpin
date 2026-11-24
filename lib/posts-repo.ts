/**
 * Community posts over a small key-value/sorted-set store and a blob adapter. Pure of runtime dependencies (type-only
 * imports), so the same code runs on Upstash Redis in production, in memory in development, and in `node --test`.
 *
 * Keys:  hairpin:post:<id>            JSON record
 *        hairpin:posts:approved       ZSET by approvedAt (the public feed)
 *        hairpin:posts:pending        ZSET by createdAt (review queue, also holds auto-held posts)
 *        hairpin:posts:by:<uid>       ZSET by createdAt (one person's posts)
 *        hairpin:post:reporters:<id>  SET of uids that reported it
 *        hairpin:post:savers:<id>     SET of uids that saved it
 *        hairpin:posts:bytes          total stored image bytes
 */
import type { Kv } from "./kv";
// Explicit .ts extension: this is the one value import between tested modules (node --test needs it).
import { POST_LIMITS, canView, type Post, type PostFields, type PostStatus } from "./posts-model.ts";

export interface PostStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  del(key: string): Promise<void>;
  zadd(key: string, score: number, member: string): Promise<void>;
  zrem(key: string, member: string): Promise<void>;
  /** Newest first; `before` is an exclusive upper score bound. */
  zrevrange(key: string, before: number | null, limit: number): Promise<{ member: string; score: number }[]>;
  zcard(key: string): Promise<number>;
  sadd(key: string, member: string): Promise<boolean>;
  srem(key: string, member: string): Promise<void>;
  scard(key: string): Promise<number>;
  incrby(key: string, by: number): Promise<number>;
}
export interface BlobAdapter {
  put(path: string, bytes: Uint8Array, contentType: string): Promise<{ url: string }>;
  del(url: string): Promise<void>;
}

const K = {
  post: (id: string) => `hairpin:post:${id}`,
  approved: "hairpin:posts:approved",
  pending: "hairpin:posts:pending",
  by: (uid: string) => `hairpin:posts:by:${uid}`,
  reporters: (id: string) => `hairpin:post:reporters:${id}`,
  savers: (id: string) => `hairpin:post:savers:${id}`,
  bytes: "hairpin:posts:bytes",
  daily: (uid: string, nowMs: number) => `hairpin:posts:up:${uid}:${new Date(nowMs).toISOString().slice(0, 10)}`,
};

export type Fail = { ok: false; status: number; code: string; message: string };
const fail = (status: number, code: string, message: string): Fail => ({ ok: false, status, code, message });

export type NewImage = { bytes: Uint8Array; width: number; height: number; contentType: string };

export function postRepo(store: PostStore, blob: BlobAdapter, kv: Kv, clock: () => number = Date.now) {
  async function load(id: string): Promise<Post | null> {
    const raw = await store.get(K.post(id));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as Post;
    } catch {
      return null;
    }
  }
  const save = (p: Post) => store.set(K.post(p.id), JSON.stringify(p));

  /** Removes a post's record, index entries and image. Idempotent. */
  async function purge(p: Post) {
    if (p.image) await blob.del(p.image).catch(() => {});
    await Promise.all([store.zrem(K.approved, p.id), store.zrem(K.pending, p.id), store.zrem(K.by(p.uid), p.id), store.del(K.reporters(p.id)), store.del(K.savers(p.id)), store.del(K.post(p.id))]);
    if (p.bytes) await store.incrby(K.bytes, -p.bytes).catch(() => {});
  }

  return {
    load,

    /** Stores a new post as pending. Caps are checked first and the daily counter is refunded on any failure. */
    async create(input: { id: string; uid: string; ownerKey: string; fields: PostFields; image: NewImage }): Promise<{ ok: true; post: Post } | Fail> {
      const now = clock();
      const { uid, image } = input;
      if (image.bytes.byteLength > POST_LIMITS.imageBytes) return fail(413, "too_large", "That photo is too large even after shrinking.");
      if ((await store.zcard(K.by(uid))) >= POST_LIMITS.livePerUser) return fail(429, "post_limit", `You can have up to ${POST_LIMITS.livePerUser} shared cuts. Delete one to add another.`);
      const total = Number((await store.get(K.bytes)) ?? 0);
      if (total + image.bytes.byteLength > POST_LIMITS.softBytes) return fail(503, "storage_full", "Sharing is paused for now. Your cut is still saved privately on this device.");
      const dayKey = K.daily(uid, now);
      const used = await kv.incr(dayKey, 2 * 24 * 3600);
      if (used > POST_LIMITS.dailyUploads) {
        await kv.decr(dayKey);
        return fail(429, "daily_limit", `You can share ${POST_LIMITS.dailyUploads} cuts a day. Try again tomorrow.`);
      }
      let url: string | null = null;
      try {
        const ext = image.contentType === "image/jpeg" ? "jpg" : "webp";
        url = (await blob.put(`posts/${input.id}.${ext}`, image.bytes, image.contentType)).url;
        const post: Post = {
          ...input.fields,
          id: input.id,
          uid,
          ownerKey: input.ownerKey,
          width: image.width,
          height: image.height,
          image: url,
          bytes: image.bytes.byteLength,
          status: "pending",
          createdAt: now,
          approvedAt: null,
          saves: 0,
        };
        await save(post);
        await Promise.all([store.zadd(K.pending, now, post.id), store.zadd(K.by(uid), now, post.id), store.incrby(K.bytes, post.bytes)]);
        return { ok: true, post };
      } catch {
        if (url) await blob.del(url).catch(() => {});
        await kv.decr(dayKey).catch(() => {});
        return fail(503, "share_unavailable", "Sharing isn't available right now. Your cut is still saved privately on this device.");
      }
    },

    /** The public feed, newest approved first. `next` is the cursor for the following page. */
    async listApproved(before: number | null, limit = POST_LIMITS.page): Promise<{ posts: Post[]; next: number | null }> {
      const rows = await store.zrevrange(K.approved, before, limit + 1);
      const page = rows.slice(0, limit);
      const posts = (await Promise.all(page.map((r) => load(r.member)))).filter((p): p is Post => p !== null && p.status === "approved");
      return { posts, next: rows.length > limit ? page[page.length - 1].score : null };
    },

    /** One person's posts in every state. */
    async listMine(uid: string): Promise<Post[]> {
      const rows = await store.zrevrange(K.by(uid), null, POST_LIMITS.livePerUser);
      return (await Promise.all(rows.map((r) => load(r.member)))).filter((p): p is Post => p !== null);
    },

    /** Posts by id that this viewer may see (approved, or their own). */
    async getMany(ids: string[], viewerUid: string | null): Promise<Post[]> {
      return (await Promise.all(ids.slice(0, 24).map(load))).filter((p): p is Post => p !== null && canView(p, viewerUid));
    },

    /** The uploader or an admin deletes a post and its image. */
    async remove(id: string, requesterUid: string, isAdmin: boolean): Promise<{ ok: true } | Fail> {
      const p = await load(id);
      if (!p) return { ok: true };
      if (p.uid !== requesterUid && !isAdmin) return fail(403, "forbidden", "That isn't your post.");
      await purge(p);
      return { ok: true };
    },

    /** A signed-in person reports an approved post. Enough distinct reports take it down for review. */
    async report(id: string, uid: string): Promise<{ ok: true; held: boolean } | Fail> {
      const p = await load(id);
      if (!p || p.status !== "approved") return fail(404, "not_found", "That cut isn't available.");
      if (p.uid === uid) return fail(400, "own_post", "You can't report your own cut.");
      await store.sadd(K.reporters(id), uid);
      const n = await store.scard(K.reporters(id));
      if (n >= POST_LIMITS.reportHold) {
        await save({ ...p, status: "held" });
        await Promise.all([store.zrem(K.approved, id), store.zadd(K.pending, clock(), id)]);
        return { ok: true, held: true };
      }
      return { ok: true, held: false };
    },

    /** Counts a save toward popularity: once per person. Returns the new total. */
    async setSaved(id: string, uid: string, on: boolean): Promise<number | null> {
      const p = await load(id);
      if (!p || p.status !== "approved") return null;
      if (on) await store.sadd(K.savers(id), uid);
      else await store.srem(K.savers(id), uid);
      const saves = await store.scard(K.savers(id));
      await save({ ...p, saves });
      return saves;
    },

    /** Admin: the review queue (pending and auto-held). */
    async queue(limit = 50): Promise<Post[]> {
      const rows = await store.zrevrange(K.pending, null, limit);
      return (await Promise.all(rows.map((r) => load(r.member)))).filter((p): p is Post => p !== null);
    },

    /** Admin: approve or reject. Rejecting deletes the image to free storage and keeps the record so the owner sees why. */
    async decide(id: string, status: Extract<PostStatus, "approved" | "rejected">): Promise<{ ok: true; post: Post } | Fail> {
      const p = await load(id);
      if (!p) return fail(404, "not_found", "That post no longer exists.");
      const now = clock();
      if (status === "approved") {
        const next = { ...p, status, approvedAt: now };
        await save(next);
        await Promise.all([store.zrem(K.pending, id), store.zadd(K.approved, now, id), store.del(K.reporters(id))]);
        return { ok: true, post: next };
      }
      if (p.image) await blob.del(p.image).catch(() => {});
      const next = { ...p, status, image: "", approvedAt: null };
      await save(next);
      await Promise.all([store.zrem(K.pending, id), store.zrem(K.approved, id)]);
      if (p.bytes) await store.incrby(K.bytes, -p.bytes).catch(() => {});
      return { ok: true, post: { ...next, bytes: 0 } };
    },

    /** Deletes everything one person shared (account deletion). */
    async removeAllFor(uid: string): Promise<number> {
      const rows = await store.zrevrange(K.by(uid), null, 1000);
      let n = 0;
      for (const r of rows) {
        const p = await load(r.member);
        if (p) {
          await purge(p);
          n++;
        } else await store.zrem(K.by(uid), r.member);
      }
      await store.del(K.by(uid));
      return n;
    },

    async usage() {
      const [bytes, approved, pending] = await Promise.all([store.get(K.bytes), store.zcard(K.approved), store.zcard(K.pending)]);
      return { bytes: Number(bytes ?? 0), approved, pending, softLimit: POST_LIMITS.softBytes };
    },
  };
}
export type PostRepo = ReturnType<typeof postRepo>;

/** In-memory store, for development without Redis and for tests. */
export function memoryPostStore(): PostStore {
  const kv = new Map<string, string>();
  const z = new Map<string, Map<string, number>>();
  const s = new Map<string, Set<string>>();
  const zset = (k: string) => z.get(k) ?? z.set(k, new Map()).get(k)!;
  const set = (k: string) => s.get(k) ?? s.set(k, new Set()).get(k)!;
  return {
    get: async (k) => kv.get(k) ?? null,
    set: async (k, v) => void kv.set(k, v),
    del: async (k) => void (kv.delete(k), z.delete(k), s.delete(k)),
    zadd: async (k, score, m) => void zset(k).set(m, score),
    zrem: async (k, m) => void zset(k).delete(m),
    zrevrange: async (k, before, limit) =>
      [...zset(k).entries()]
        .filter(([, sc]) => before === null || sc < before)
        .sort((a, b) => b[1] - a[1] || b[0].localeCompare(a[0]))
        .slice(0, limit)
        .map(([member, score]) => ({ member, score })),
    zcard: async (k) => zset(k).size,
    sadd: async (k, m) => {
      const had = set(k).has(m);
      set(k).add(m);
      return !had;
    },
    srem: async (k, m) => void set(k).delete(m),
    scard: async (k) => set(k).size,
    incrby: async (k, by) => {
      const n = Number(kv.get(k) ?? 0) + by;
      kv.set(k, String(n));
      return n;
    },
  };
}

/** Upstash Redis REST commands for the same interface. */
export function redisPostStore(cmd: <T>(args: (string | number)[]) => Promise<T>): PostStore {
  return {
    get: (k) => cmd<string | null>(["GET", k]),
    set: async (k, v) => void (await cmd(["SET", k, v])),
    del: async (k) => void (await cmd(["DEL", k])),
    zadd: async (k, score, m) => void (await cmd(["ZADD", k, score, m])),
    zrem: async (k, m) => void (await cmd(["ZREM", k, m])),
    zrevrange: async (k, before, limit) => {
      const flat = await cmd<string[]>(["ZREVRANGEBYSCORE", k, before === null ? "+inf" : `(${before}`, "-inf", "WITHSCORES", "LIMIT", 0, limit]);
      const out: { member: string; score: number }[] = [];
      for (let i = 0; i + 1 < flat.length; i += 2) out.push({ member: flat[i], score: Number(flat[i + 1]) });
      return out;
    },
    zcard: async (k) => Number(await cmd<number>(["ZCARD", k])),
    sadd: async (k, m) => Number(await cmd<number>(["SADD", k, m])) === 1,
    srem: async (k, m) => void (await cmd(["SREM", k, m])),
    scard: async (k) => Number(await cmd<number>(["SCARD", k])),
    incrby: async (k, by) => Number(await cmd<number>(["INCRBY", k, by])),
  };
}
