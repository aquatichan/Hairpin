// Run with: npm test   (Node's built-in runner; Node strips the TypeScript types on import.)
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  PROVIDER_CAPABILITY,
  assertSendable,
  cleanText,
  isLookId,
  planTryon,
  referenceAccess,
  sniffImage,
} from "../lib/tryon-plan.ts";

const LOOK = { id: "sleek-low-bun", name: "Sleek low bun", length: "long", texture: "straight", notes: "Centre part, smoothed back." };
const TARGETS = [
  { kind: "catalog-reference", lookId: LOOK.id },
  { kind: "catalog-describe", lookId: LOOK.id },
  { kind: "upload", name: "From Decode" },
  { kind: "upload", name: null },
  { kind: "text", description: "Short textured crop with a low fade" },
];
const TWEAKS = [null, "Shorter", "More volume"];

test("capability table: OpenAI and Gemini are verified; OpenRouter is one image; publik is unverified", () => {
  assert.equal(PROVIDER_CAPABILITY.openai, "multi_image_verified");
  assert.equal(PROVIDER_CAPABILITY.gemini, "multi_image_verified");
  assert.equal(PROVIDER_CAPABILITY.openrouter, "single_image");
  assert.equal(PROVIDER_CAPABILITY.publik, "multi_image_unverified");
  assert.ok(Object.isFrozen(PROVIDER_CAPABILITY));
  assert.throws(() => {
    "use strict";
    PROVIDER_CAPABILITY.publik = "multi_image_verified";
  });
});

test("publik never gets reference access without the explicit trial flag", () => {
  assert.deepEqual(referenceAccess("publik"), { allowed: false, reason: "multi_image_unverified" });
  assert.deepEqual(referenceAccess("publik", false), { allowed: false, reason: "multi_image_unverified" });
  assert.deepEqual(referenceAccess("publik", true), { allowed: true, experimental: true });
  assert.deepEqual(referenceAccess("openai"), { allowed: true, experimental: false });
  assert.deepEqual(referenceAccess("gemini"), { allowed: true, experimental: false });
  assert.deepEqual(referenceAccess("openrouter"), { allowed: false, reason: "single_image" });
  assert.deepEqual(referenceAccess("openrouter", true), { allowed: false, reason: "single_image" }, "the publik trial flag never applies elsewhere");
});

test("no plan for publik (trial off) or OpenRouter ever uses two images, for every target and tweak", () => {
  for (const provider of ["publik", "openrouter"]) {
    for (const target of TARGETS) {
      for (const tweak of TWEAKS) {
        const plan = planTryon({ target, provider, publikTrial: provider === "openrouter", look: LOOK, tweak });
        if (plan.ok) assert.equal(plan.imageCount, 1, `${target.kind} planned two images on ${provider}`);
      }
    }
  }
  const refused = planTryon({ target: TARGETS[0], provider: "openrouter", look: LOOK, tweak: null });
  assert.equal(refused.code, "reference_unsupported");
  assert.match(refused.message, /OpenRouter hasn't confirmed/);
});

test("a Discover reference on publik is refused with an explicit alternative, never downgraded to text", () => {
  const plan = planTryon({ target: TARGETS[0], provider: "publik", look: LOOK, tweak: null });
  assert.equal(plan.ok, false);
  assert.equal(plan.status, 409);
  assert.equal(plan.code, "reference_unsupported");
  assert.equal(plan.alternative, "catalog-describe");

  const upload = planTryon({ target: TARGETS[2], provider: "publik", look: null, tweak: null });
  assert.equal(upload.ok, false);
  assert.equal(upload.alternative, "text");
});

test("OpenAI and Gemini keys send selfie + reference with separated roles", () => {
  assert.equal(planTryon({ target: TARGETS[0], provider: "gemini", look: LOOK, tweak: null }).imageCount, 2);
  const plan = planTryon({ target: TARGETS[0], provider: "openai", look: LOOK, tweak: null });
  assert.equal(plan.ok, true);
  assert.equal(plan.imageCount, 2);
  assert.equal(plan.experimental, false);
  assert.match(plan.prompt, /Image 1 is the person\. Image 2 is a hairstyle reference and nothing else\./);
  assert.match(plan.prompt, /Take only the hairstyle from image 2/);
  assert.match(plan.prompt, /not the face, identity, skin tone/);
  assert.match(plan.prompt, /Keep the person's own natural hair colour/);
});

test("the publik trial is labelled experimental", () => {
  const plan = planTryon({ target: TARGETS[0], provider: "publik", publikTrial: true, look: LOOK, tweak: null });
  assert.equal(plan.ok, true);
  assert.equal(plan.imageCount, 2);
  assert.equal(plan.experimental, true);
  // Blind prompt: nothing but the image can tell the model which cut to make.
  assert.doesNotMatch(plan.prompt, /Sleek|bun|long length|straight texture/i);
});

test("written-description modes use one image on every provider", () => {
  for (const provider of ["openai", "gemini", "openrouter", "publik"]) {
    for (const target of [TARGETS[1], TARGETS[4]]) {
      const plan = planTryon({ target, provider, look: LOOK, tweak: "Shorter" });
      assert.equal(plan.ok, true);
      assert.equal(plan.imageCount, 1);
      assert.doesNotMatch(plan.prompt, /image 2/i);
    }
  }
});

test("assertSendable is the last gate: two images to publik throw, even if a caller skipped planning", () => {
  assert.throws(() => assertSendable("publik", 2), /not verified/);
  assert.throws(() => assertSendable("publik", 2, false), /not verified/);
  assert.doesNotThrow(() => assertSendable("publik", 1));
  assert.doesNotThrow(() => assertSendable("openai", 2));
  assert.doesNotThrow(() => assertSendable("gemini", 2));
  assert.throws(() => assertSendable("openrouter", 2), /not verified/);
  assert.doesNotThrow(() => assertSendable("openrouter", 1));
  assert.doesNotThrow(() => assertSendable("publik", 2, true));
  assert.throws(() => assertSendable("openai", 3), /at most two/);
  assert.throws(() => assertSendable("openai", 0), /photo/);
});

test("missing catalog looks and empty descriptions are rejected", () => {
  assert.equal(planTryon({ target: TARGETS[0], provider: "openai", look: null, tweak: null }).code, "unknown_look");
  assert.equal(planTryon({ target: { kind: "text", description: " \n " }, provider: "openai", look: null, tweak: null }).code, "bad_request");
});

test("catalog IDs are slugs only: no paths, URLs or traversal", () => {
  for (const ok of ["curly-top", "natural-afro", "a1"]) assert.ok(isLookId(ok), ok);
  for (const bad of ["", "../secrets", "/assets/x.webp", "https://evil.example/x.png", "Curly-Top", "a b", "a/b", "a.webp", "x".repeat(65), null, 3]) {
    assert.equal(isLookId(bad), false, String(bad));
  }
});

test("free text is cleaned before it reaches a prompt", () => {
  assert.equal(cleanText("  Short\u0000 crop\n\n with   fade\u202e ", 240), "Short crop with fade");
  assert.equal(cleanText("x".repeat(500), 240).length, 240);
  assert.equal(cleanText(42, 10), "");
});

test("images are recognised by their bytes, not their names", () => {
  assert.equal(sniffImage(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])), "image/jpeg");
  assert.equal(sniffImage(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), "image/png");
  assert.equal(sniffImage(new TextEncoder().encode("RIFF\u0000\u0000\u0000\u0000WEBPVP8 ")), "image/webp");
  assert.equal(sniffImage(new TextEncoder().encode("<svg xmlns=")), null);
  assert.equal(sniffImage(new TextEncoder().encode("GIF89a")), null);
});

test("an Anthropic key never reaches the image path: every try-on is refused, before and at the last gate", () => {
  assert.equal(PROVIDER_CAPABILITY.anthropic, "no_image_output");
  for (const target of TARGETS) {
    const plan = planTryon({ target, provider: "anthropic", publikTrial: true, look: LOOK, tweak: null });
    assert.equal(plan.ok, false);
    assert.equal(plan.code, "provider_cannot_render");
  }
  assert.throws(() => assertSendable("anthropic", 1), /can't make images/);
  assert.throws(() => assertSendable("anthropic", 2, true), /can't make images/);
  assert.deepEqual(referenceAccess("anthropic", true), { allowed: false, reason: "no_image_output" });
});
