import assert from "node:assert/strict";
import { test } from "node:test";
import { FREE_PER_IP, RENDERS_PER_WINDOW, freeRemaining, reserveAllowance, reserveFreeTryon, takeRenderTicket } from "../lib/guards.ts";
import { memoryKv, redisKv } from "../lib/kv.ts";

/** A fake Upstash: the Redis commands the guards send, with expiry, shared by every "instance" that uses it. */
function fakeRedis(clock) {
  const m = new Map();
  const live = (k) => {
    const v = m.get(k);
    if (v && v.until !== null && v.until <= clock()) m.delete(k);
    return m.get(k);
  };
  const log = [];
  const cmd = async (args) => {
    log.push(args.map(String).join(" "));
    const [op, key, ...rest] = args.map(String);
    switch (op) {
      case "SET": {
        const nx = rest.includes("NX");
        const ex = rest.includes("EX") ? Number(rest[rest.indexOf("EX") + 1]) : null;
        if (nx && live(key)) return null;
        m.set(key, { v: rest[0], until: ex ? clock() + ex * 1000 : null });
        return "OK";
      }
      case "INCR": {
        const cur = live(key);
        const n = Number(cur?.v ?? 0) + 1;
        m.set(key, { v: String(n), until: cur?.until ?? null });
        return n;
      }
      case "DECR": {
        const cur = live(key);
        const n = Number(cur?.v ?? 0) - 1;
        m.set(key, { v: String(n), until: cur?.until ?? null });
        return n;
      }
      case "EXPIRE": {
        const cur = live(key);
        if (cur) cur.until = clock() + Number(rest[0]) * 1000;
        return cur ? 1 : 0;
      }
      case "DEL":
        return m.delete(key) ? 1 : 0;
      case "GET":
        return live(key)?.v ?? null;
      default:
        throw new Error(`unexpected ${op}`);
    }
  };
  return { cmd, log };
}

test("two server instances sharing Redis allow one render at a time per person", async () => {
  let now = 1_000_000;
  const redis = fakeRedis(() => now);
  const instanceA = redisKv(redis.cmd);
  const instanceB = redisKv(redis.cmd);
  const first = await takeRenderTicket(instanceA, "alice", now);
  assert.equal(first.ok, true);
  const second = await takeRenderTicket(instanceB, "alice", now);
  assert.equal(second.code, "render_in_progress", "the other instance sees the lock");
  assert.equal((await takeRenderTicket(instanceB, "bob", now)).ok, true, "other people aren't blocked");
  await first.release();
  assert.equal((await takeRenderTicket(instanceB, "alice", now)).ok, true, "released for everyone");
  assert.ok(redis.log.some((l) => l.startsWith("SET hairpin:render:lock:alice 1 NX EX 180")));
});

test("a lock left by a crashed instance expires on its own", async () => {
  let now = 0;
  const kv = redisKv(fakeRedis(() => now).cmd);
  assert.equal((await takeRenderTicket(kv, "alice", now)).ok, true); // never released
  assert.equal((await takeRenderTicket(kv, "alice", now)).code, "render_in_progress");
  now += 181_000;
  assert.equal((await takeRenderTicket(kv, "alice", now)).ok, true);
});

test("the per-window cap is shared across instances and resets with the window", async () => {
  let now = 0;
  const redis = fakeRedis(() => now);
  const kvs = [redisKv(redis.cmd), redisKv(redis.cmd)];
  for (let i = 0; i < RENDERS_PER_WINDOW; i++) {
    const t = await takeRenderTicket(kvs[i % 2], "alice", now);
    assert.equal(t.ok, true, `render ${i + 1}`);
    await t.release();
  }
  const over = await takeRenderTicket(kvs[0], "alice", now);
  assert.equal(over.code, "rate_limited");
  assert.ok(over.retryAfter > 0 && over.retryAfter <= 600);
  assert.equal((await takeRenderTicket(kvs[1], "alice", now)).code, "rate_limited", "a refused attempt doesn't hold the lock");
  now += 600_000;
  assert.equal((await takeRenderTicket(kvs[1], "alice", now)).ok, true, "next window");
});

test("guards fail closed when the store is down", async () => {
  const broken = redisKv(async () => {
    throw new Error("connection refused");
  });
  assert.equal((await takeRenderTicket(broken, "alice", 0)).code, "guard_unavailable");
  assert.equal((await reserveFreeTryon(broken, "hash", 50, 0)).code, "free_unavailable");
});

test("free try-ons: 3 per IP across instances, refunds on failure, daily ceiling", async () => {
  let now = Date.UTC(2026, 10, 22, 12);
  const redis = fakeRedis(() => now);
  const a = redisKv(redis.cmd);
  const b = redisKv(redis.cmd);
  const r1 = await reserveFreeTryon(a, "ip1", 50, now);
  const r2 = await reserveFreeTryon(b, "ip1", 50, now);
  assert.equal(r1.remaining, 2);
  assert.equal(r2.remaining, 1);
  await r2.refund(); // provider failed
  await r2.refund(); // refunds once only
  assert.equal(await freeRemaining(a, "ip1"), 2);
  assert.equal((await reserveFreeTryon(a, "ip1", 50, now)).ok, true);
  assert.equal((await reserveFreeTryon(b, "ip1", 50, now)).ok, true);
  const fourth = await reserveFreeTryon(a, "ip1", 50, now);
  assert.equal(fourth.code, "free_used");
  assert.equal(await freeRemaining(b, "ip1"), 0, "a refused attempt isn't counted");
  // Daily ceiling across everyone.
  const capped = memoryKv(() => now);
  assert.equal((await reserveFreeTryon(capped, "x", 2, now)).ok, true);
  assert.equal((await reserveFreeTryon(capped, "y", 2, now)).ok, true);
  const third = await reserveFreeTryon(capped, "z", 2, now);
  assert.equal(third.code, "free_busy");
  assert.equal(await freeRemaining(capped, "z"), FREE_PER_IP, "a ceiling refusal doesn't use up the person's own count");
});

test("the account allowance caps total try-ons per day and month, beyond the burst limit", async () => {
  let now = Date.UTC(2026, 10, 22, 9);
  const kv = redisKv(fakeRedis(() => now).cmd);
  const limits = { daily: 3, monthly: 5 };
  for (let i = 0; i < 3; i++) assert.equal((await reserveAllowance(kv, "alice", limits, now)).ok, true);
  const capped = await reserveAllowance(kv, "alice", limits, now);
  assert.equal(capped.code, "allowance_reached");
  assert.match(capped.message, /today's 3/);
  // Waiting out the burst window doesn't help; a failed render is refunded.
  now += 11 * 60_000;
  assert.equal((await reserveAllowance(kv, "alice", limits, now)).code, "allowance_reached");
  now = Date.UTC(2026, 10, 23, 9);
  const r = await reserveAllowance(kv, "alice", limits, now);
  assert.equal(r.ok, true);
  await r.refund();
  assert.equal((await reserveAllowance(kv, "alice", limits, now)).ok, true);
  assert.equal((await reserveAllowance(kv, "alice", limits, now)).ok, true);
  const month = await reserveAllowance(kv, "alice", limits, now);
  assert.equal(month.code, "allowance_reached");
  assert.match(month.message, /this month's 5/);
  assert.equal((await reserveAllowance(kv, "bob", limits, now)).ok, true, "per account");
});
