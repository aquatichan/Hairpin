import assert from "node:assert/strict";
import { test } from "node:test";
import { memoryKv } from "../lib/kv.ts";
import { POST_LIMITS, canView, cleanPostFields, isPostId, publicView, sensibleShape } from "../lib/posts-model.ts";
import { memoryPostStore, postRepo } from "../lib/posts-repo.ts";
import { AUDIENCES, STYLE_TAGS } from "../lib/style.ts";

const vocab = { audiences: AUDIENCES, lengths: ["short", "medium", "long"], hairTypes: ["1a", "2b", "4c"], tags: STYLE_TAGS };
const fields = { name: "Textured crop", description: "Short sides.", audience: "men", length: "short", hairType: "2b", tags: ["crop", "fade"] };

function setup() {
  let now = Date.UTC(2026, 10, 20, 12);
  const blobs = new Map();
  const blob = {
    put: async (path, bytes) => (blobs.set(`https://blob.example/${path}`, bytes.byteLength), { url: `https://blob.example/${path}` }),
    del: async (url) => void blobs.delete(url),
  };
  const repo = postRepo(memoryPostStore(), blob, memoryKv(() => now), () => now);
  const img = (n = 80_000) => ({ bytes: new Uint8Array(n), width: 720, height: 960, contentType: "image/webp" });
  let seq = 0;
  const make = (uid, over = {}) => repo.create({ id: `p-${String(++seq).padStart(12, "0").replace(/0/g, "a")}`, uid, ownerKey: `k${uid.length}x`, fields, image: img(), ...over });
  return { repo, blobs, make, tick: (ms) => (now += ms), now: () => now };
}

test("validation keeps only vocabulary, caps lengths and strips control characters", () => {
  const ok = cleanPostFields({ ...fields, name: "  Hello‮\u0000   world  ", tags: ["crop", "crop", "not-a-tag", "fade"] }, vocab);
  assert.ok(ok.ok);
  assert.equal(ok.fields.name, "Hello world");
  assert.deepEqual(ok.fields.tags, ["crop", "fade"]);
  assert.deepEqual(cleanPostFields({ ...fields, tags: JSON.stringify(["bun", "x"]) }, vocab).fields.tags, ["bun"]);
  assert.equal(cleanPostFields({ ...fields, tags: STYLE_TAGS }, vocab).fields.tags.length, POST_LIMITS.tags);
  assert.equal(cleanPostFields({ ...fields, name: "x".repeat(500) }, vocab).fields.name.length, POST_LIMITS.name);
  for (const bad of [{ name: "" }, { audience: "dogs" }, { length: "huge" }, { hairType: "9z" }]) assert.equal(cleanPostFields({ ...fields, ...bad }, vocab).ok, false);
  assert.ok(isPostId("p-0123456789ab") && !isPostId("p-xyz") && !isPostId("m-0123456789ab") && !isPostId("../x"));
  assert.ok(sensibleShape(720, 960) && !sensibleShape(100, 900) && !sensibleShape(3000, 400));
});

test("nothing is public until approved; only the uploader sees pending posts", async () => {
  const { repo, make } = setup();
  const r = await make("alice");
  assert.ok(r.ok);
  assert.equal(r.post.status, "pending");
  assert.deepEqual((await repo.listApproved(null)).posts, []);
  assert.equal((await repo.getMany([r.post.id], "bob")).length, 0);
  assert.equal((await repo.getMany([r.post.id], "alice")).length, 1);
  assert.ok(canView(r.post, "alice") && !canView(r.post, "bob") && !canView(r.post, null));
  assert.ok((await repo.decide(r.post.id, "approved")).ok);
  assert.equal((await repo.listApproved(null)).posts.length, 1);
  assert.equal((await repo.getMany([r.post.id], null)).length, 1);
});

test("clients never see the uid or storage details; only the uploader sees status", async () => {
  const { repo, make } = setup();
  const { post } = await make("alice");
  const theirs = publicView(post, "bob");
  assert.ok(!("uid" in theirs) && !("bytes" in theirs) && !("status" in theirs) && !theirs.mine);
  assert.ok(!JSON.stringify(theirs).includes("alice"));
  const mine = publicView(post, "alice");
  assert.equal(mine.status, "pending");
  assert.equal(mine.mine, true);
  void repo;
});

test("the feed pages newest-first with a stable cursor", async () => {
  const { repo, make, tick } = setup();
  const ids = [];
  for (let i = 0; i < 5; i++) {
    tick(1000);
    const r = await make(`u${i}`);
    ids.push(r.post.id);
    await repo.decide(r.post.id, "approved");
  }
  const p1 = await repo.listApproved(null, 2);
  assert.deepEqual(p1.posts.map((p) => p.id), [ids[4], ids[3]]);
  assert.ok(p1.next !== null);
  const p2 = await repo.listApproved(p1.next, 2);
  assert.deepEqual(p2.posts.map((p) => p.id), [ids[2], ids[1]]);
  const p3 = await repo.listApproved(p2.next, 2);
  assert.deepEqual(p3.posts.map((p) => p.id), [ids[0]]);
  assert.equal(p3.next, null);
});

test("daily upload cap, live-post cap, and refunds on failure", async () => {
  const { repo, make, tick } = setup();
  for (let i = 0; i < POST_LIMITS.dailyUploads; i++) assert.ok((await make("alice")).ok, `upload ${i}`);
  const sixth = await make("alice");
  assert.ok(!sixth.ok && sixth.code === "daily_limit" && sixth.status === 429);
  assert.ok((await make("bob")).ok, "another person is unaffected");
  tick(25 * 3600 * 1000);
  const again = await make("alice");
  assert.ok(again.ok, "resets the next day: " + JSON.stringify(again));
  // live cap: fill to the limit over several days
  for (let day = 0; (await repo.listMine("alice")).length < POST_LIMITS.livePerUser; day++) {
    tick(25 * 3600 * 1000);
    for (let i = 0; i < POST_LIMITS.dailyUploads && (await repo.listMine("alice")).length < POST_LIMITS.livePerUser; i++) await make("alice");
  }
  tick(25 * 3600 * 1000);
  const over = await make("alice");
  assert.ok(!over.ok && over.code === "post_limit");
});

test("a failed upload refunds the daily count and leaves no orphaned image", async () => {
  const blobs = new Map();
  let failSet = true;
  const store = memoryPostStore();
  const flaky = { ...store, set: async (k, v) => (failSet ? Promise.reject(new Error("down")) : store.set(k, v)) };
  const blob = { put: async (p) => (blobs.set(p, 1), { url: p }), del: async (u) => void blobs.delete(u) };
  const kv = memoryKv();
  const repo = postRepo(flaky, blob, kv);
  const r = await repo.create({ id: "p-aaaaaaaaaaaa", uid: "alice", ownerKey: "k", fields, image: { bytes: new Uint8Array(10), width: 500, height: 600, contentType: "image/webp" } });
  assert.ok(!r.ok && r.code === "share_unavailable");
  assert.equal(blobs.size, 0, "image removed");
  failSet = false;
  for (let i = 0; i < POST_LIMITS.dailyUploads; i++) assert.ok((await repo.create({ id: `p-aaaaaaaaaa0${i}`, uid: "alice", ownerKey: "k", fields, image: { bytes: new Uint8Array(10), width: 500, height: 600, contentType: "image/webp" } })).ok);
});

test("oversize images and a full storage budget refuse cleanly", async () => {
  const { make, repo } = setup();
  const big = await make("alice", { image: { bytes: new Uint8Array(POST_LIMITS.imageBytes + 1), width: 800, height: 800, contentType: "image/webp" } });
  assert.ok(!big.ok && big.status === 413);
  // Fill the byte counter to just under the soft limit via a shared store.
  const store = memoryPostStore();
  await store.incrby("hairpin:posts:bytes", POST_LIMITS.softBytes - 50_000);
  const r2 = postRepo(store, { put: async (p) => ({ url: p }), del: async () => {} }, memoryKv());
  const full = await r2.create({ id: "p-bbbbbbbbbbbb", uid: "carol", ownerKey: "k", fields, image: { bytes: new Uint8Array(80_000), width: 600, height: 800, contentType: "image/webp" } });
  assert.ok(!full.ok && full.code === "storage_full" && full.status === 503);
  void repo;
});

test("reports: three distinct reporters hold a post, one reporter can't, own posts can't be reported", async () => {
  const { repo, make } = setup();
  const { post } = await make("alice");
  await repo.decide(post.id, "approved");
  assert.equal((await repo.report(post.id, "alice")).code, "own_post");
  for (let i = 0; i < 5; i++) await repo.report(post.id, "bob");
  assert.equal((await repo.load(post.id)).status, "approved", "one person reporting five times is one report");
  assert.equal((await repo.report(post.id, "carol")).held, false);
  const last = await repo.report(post.id, "dave");
  assert.ok(last.ok && last.held);
  assert.equal((await repo.listApproved(null)).posts.length, 0, "taken down");
  assert.equal((await repo.queue()).length, 1, "back in the review queue");
  assert.equal((await repo.report(post.id, "erin")).code, "not_found", "can't report what isn't live");
  await repo.decide(post.id, "approved");
  assert.equal((await repo.listApproved(null)).posts.length, 1);
});

test("rejecting or deleting frees the image and the byte budget; only the owner or an admin may delete", async () => {
  const { repo, make, blobs } = setup();
  const a = (await make("alice")).post, b = (await make("bob")).post;
  assert.equal(blobs.size, 2);
  assert.equal((await repo.usage()).bytes, 160_000);
  assert.equal((await repo.remove(a.id, "mallory", false)).code, "forbidden");
  assert.ok((await repo.remove(a.id, "alice", false)).ok);
  assert.equal(blobs.size, 1);
  assert.equal((await repo.load(a.id)), null);
  assert.equal((await repo.usage()).bytes, 80_000);
  const rej = await repo.decide(b.id, "rejected");
  assert.ok(rej.ok);
  assert.equal(blobs.size, 0);
  assert.equal((await repo.usage()).bytes, 0);
  assert.equal((await repo.getMany([b.id], "bob"))[0].status, "rejected", "the owner can see it was declined");
  assert.ok((await repo.remove(b.id, "admin", true)).ok);
});

test("saves count once per person and only on live posts", async () => {
  const { repo, make } = setup();
  const { post } = await make("alice");
  assert.equal(await repo.setSaved(post.id, "bob", true), null, "pending posts can't be saved");
  await repo.decide(post.id, "approved");
  assert.equal(await repo.setSaved(post.id, "bob", true), 1);
  assert.equal(await repo.setSaved(post.id, "bob", true), 1);
  assert.equal(await repo.setSaved(post.id, "carol", true), 2);
  assert.equal(await repo.setSaved(post.id, "bob", false), 1);
  assert.equal((await repo.load(post.id)).saves, 1);
});

test("account deletion removes every post, image and counter", async () => {
  const { repo, make, blobs } = setup();
  const a1 = (await make("alice")).post, a2 = (await make("alice")).post, b1 = (await make("bob")).post;
  await repo.decide(a1.id, "approved");
  assert.equal(await repo.removeAllFor("alice"), 2);
  assert.equal(blobs.size, 1);
  assert.equal(await repo.load(a1.id), null);
  assert.equal(await repo.load(a2.id), null);
  assert.ok(await repo.load(b1.id));
  assert.deepEqual(await repo.listMine("alice"), []);
  assert.equal((await repo.listApproved(null)).posts.length, 0);
  assert.equal((await repo.usage()).bytes, 80_000);
});
