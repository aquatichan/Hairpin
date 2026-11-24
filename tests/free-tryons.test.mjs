import assert from "node:assert/strict";
import { test } from "node:test";
import { clientIp, ipHash } from "../lib/client-ip.ts";
import { VENDORS, VENDOR_INFO, isVendor, looksLikeKey } from "../lib/ai-vendors.ts";

test("the platform's IP headers win over a client-supplied x-forwarded-for", () => {
  const h = (o) => new Headers(o);
  assert.equal(clientIp(h({ "x-vercel-forwarded-for": "203.0.113.7", "x-forwarded-for": "1.1.1.1" })), "203.0.113.7");
  assert.equal(clientIp(h({ "x-real-ip": "203.0.113.8", "x-forwarded-for": "1.1.1.1" })), "203.0.113.8");
  assert.equal(clientIp(h({ "x-forwarded-for": "198.51.100.1, 10.0.0.1" })), "198.51.100.1");
  assert.equal(clientIp(h({})), null);
});

test("IPs are stored only as salted one-way hashes", () => {
  const a = ipHash("203.0.113.7", "salt-one");
  assert.equal(a, ipHash("203.0.113.7", "salt-one"), "stable");
  assert.notEqual(a, ipHash("203.0.113.7", "salt-two"), "salted");
  assert.notEqual(a, ipHash("203.0.113.8", "salt-one"));
  assert.ok(!a.includes("203"), "no address in the key");
  assert.match(a, /^[0-9a-f]{40}$/);
});

test("own-key providers: OpenAI, Gemini, OpenRouter, Anthropic; keys are only sanity-checked", () => {
  assert.deepEqual([...VENDORS], ["openai", "gemini", "openrouter", "anthropic"]);
  assert.ok(isVendor("gemini") && isVendor("anthropic") && !isVendor("claude") && !isVendor("../x"));
  for (const v of VENDORS) assert.ok(VENDOR_INFO[v].keysUrl.startsWith("https://"));
  assert.ok(looksLikeKey("sk-" + "a".repeat(40)));
  assert.ok(!looksLikeKey("sk-short"));
  assert.ok(!looksLikeKey("sk-" + "a".repeat(20) + " spaced"));
});
