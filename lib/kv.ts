/**
 * The few counter operations the cost guards need, over Upstash Redis (production) or memory (development).
 * Dependency-free so the guards can be tested against a shared fake Redis that stands in for several server instances.
 */
export interface Kv {
  /** SET key 1 NX EX ttl: true if this call took the key. */
  setNx(key: string, ttlS: number): Promise<boolean>;
  /** INCR, setting the expiry when the key is new. */
  incr(key: string, ttlS: number): Promise<number>;
  decr(key: string): Promise<void>;
  del(key: string): Promise<void>;
  get(key: string): Promise<number>;
}

export type RedisCommand = <T>(args: (string | number)[]) => Promise<T>;

export function redisKv(cmd: RedisCommand): Kv {
  return {
    setNx: async (key, ttl) => (await cmd<string | null>(["SET", key, "1", "NX", "EX", ttl])) === "OK",
    incr: async (key, ttl) => {
      const n = await cmd<number>(["INCR", key]);
      if (n === 1) await cmd(["EXPIRE", key, ttl]);
      return n;
    },
    decr: async (key) => void (await cmd(["DECR", key])),
    del: async (key) => void (await cmd(["DEL", key])),
    get: async (key) => Number((await cmd<string | number | null>(["GET", key])) ?? 0),
  };
}

export function memoryKv(clock: () => number = Date.now): Kv {
  const m = new Map<string, { n: number; until: number }>();
  const live = (k: string) => {
    const v = m.get(k);
    return v && v.until > clock() ? v : undefined;
  };
  return {
    setNx: async (key, ttl) => {
      if (live(key)) return false;
      m.set(key, { n: 1, until: clock() + ttl * 1000 });
      return true;
    },
    incr: async (key, ttl) => {
      const v = live(key);
      const next = v ? { n: v.n + 1, until: v.until } : { n: 1, until: clock() + ttl * 1000 };
      m.set(key, next);
      return next.n;
    },
    decr: async (key) => {
      const v = live(key);
      if (v) v.n -= 1;
    },
    del: async (key) => void m.delete(key),
    get: async (key) => live(key)?.n ?? 0,
  };
}
