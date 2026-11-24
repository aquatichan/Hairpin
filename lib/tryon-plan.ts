/**
 * Try-on planning: which inputs a request uses, whether the provider may receive them, and the prompt.
 *
 * Pure and dependency-free, so the server route, the studio UI and `node --test` all share one source
 * of truth. Nothing here touches the network, keys or images.
 */

import type { Vendor } from "./ai-vendors";

/** Who runs an image edit: the person's publik plan, or a provider key (their own, or the app's for free try-ons). */
export type ProviderKind = "publik" | Vendor;

/**
 * What a provider's image-edit endpoint is known to do with more than one input image.
 *  - multi_image_verified: the provider's own docs say several images are used as references.
 *  - multi_image_unverified: the endpoint takes a multipart form, but nothing documents a second image being used.
 *  - single_image: one input image is documented; more are not.
 *  - no_image_output: the provider can't make images at all (Claude), so no try-on is ever sent there.
 */
export type EditCapability = "multi_image_verified" | "multi_image_unverified" | "single_image" | "no_image_output";

export const PROVIDER_CAPABILITY: Readonly<Record<ProviderKind, EditCapability>> = Object.freeze({
  // OpenAI POST /v1/images/edits: "For GPT image models, you can provide up to 16 images", sent as repeated
  // image[] fields (developers.openai.com/api/reference/resources/images, checked 2026-11-22).
  openai: "multi_image_verified",
  // Gemini Interactions API: "Up to 14 reference images", including up to 4 character images on Nano Banana 2.1
  // (aistudio.google.com/docs/image-generation, checked 2026-11-22).
  gemini: "multi_image_verified",
  // OpenRouter POST /api/v1/images: one input reference is documented; "the number of references accepted varies by
  // provider", and nothing says which reference is the image being edited.
  openrouter: "single_image",
  // publik /images/edits exists (401 without a key, 404 for unknown paths), but its docs list neither the
  // endpoint nor multi-image input. Do not infer support from a multipart form being accepted.
  publik: "multi_image_unverified",
  // Claude reads images but does not generate them.
  anthropic: "no_image_output",
});

export type ReferenceAccess = { allowed: true; experimental: boolean } | { allowed: false; reason: EditCapability };

/**
 * May this provider receive a selfie plus a hairstyle reference in one edit?
 * `publikTrial` is the opt-in used only for the authenticated validation procedure; results made under it are
 * marked experimental. It never applies to a provider whose capability is single_image.
 */
export function referenceAccess(kind: ProviderKind, publikTrial = false): ReferenceAccess {
  const capability = PROVIDER_CAPABILITY[kind];
  if (capability === "multi_image_verified") return { allowed: true, experimental: false };
  if (capability === "multi_image_unverified" && kind === "publik" && publikTrial) return { allowed: true, experimental: true };
  return { allowed: false, reason: capability };
}

/* ---------- requests ---------- */

/** The hairstyle a try-on aims for. */
export type TryonTarget =
  /** A Discover look, matched from its reference portrait (two images). */
  | { kind: "catalog-reference"; lookId: string }
  /** A Discover look, made from its curated written description only (one image). */
  | { kind: "catalog-describe"; lookId: string }
  /** The person's own screenshot, handed over from Decode or uploaded in the studio (two images). */
  | { kind: "upload"; name: string | null }
  /** A hairstyle the person described in their own words (one image). */
  | { kind: "text"; description: string };

export type TryonMode = TryonTarget["kind"];

export const usesReferenceImage = (kind: TryonMode) => kind === "catalog-reference" || kind === "upload";

export const LIMITS = Object.freeze({
  /** publik rejects request bodies over about 4 MB, so the selfie and a reference together must stay below that. */
  photoBytes: 2_500_000,
  referenceBytes: 1_200_000,
  totalBytes: 3_800_000,
  descriptionMin: 3,
  descriptionMax: 240,
  nameMax: 80,
  imageTypes: ["image/jpeg", "image/png", "image/webp"] as readonly string[],
});

export const TWEAKS = ["Shorter", "Longer", "More volume", "Curtain fringe", "Lower fade", "Messier texture"] as const;

const LOOK_ID = /^[a-z0-9]+(?:-[a-z0-9]+){0,7}$/;

/** A catalog ID is only ever a short slug. Anything else (paths, URLs, dots, slashes) is refused before any lookup. */
export const isLookId = (value: unknown): value is string => typeof value === "string" && value.length <= 64 && LOOK_ID.test(value);

/** Strips control characters and collapses whitespace so free text can't smuggle formatting into the prompt. */
export function cleanText(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u206f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

/** Recognises JPEG, PNG and WebP by their first bytes, so a renamed file of another kind is refused. */
export function sniffImage(head: Uint8Array): "image/jpeg" | "image/png" | "image/webp" | null {
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return "image/jpeg";
  if (head.length >= 8 && head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47) return "image/png";
  if (head.length >= 12 && String.fromCharCode(...head.slice(0, 4)) === "RIFF" && String.fromCharCode(...head.slice(8, 12)) === "WEBP") return "image/webp";
  return null;
}

/* ---------- planning ---------- */

export type LookFacts = { id: string; name: string; length: string; texture: string; notes: string };

export type TryonPlan =
  | { ok: true; mode: TryonMode; imageCount: 1 | 2; prompt: string; label: string; experimental: boolean }
  | { ok: false; status: number; code: string; message: string; alternative?: "catalog-describe" | "text" };

const PROVIDER_NAME: Record<ProviderKind, string> = { publik: "publik", openai: "OpenAI", gemini: "Gemini", openrouter: "OpenRouter", anthropic: "Anthropic" };

export const CANNOT_RENDER = "Claude can't make images, so try-ons need a publik plan, the free try-ons, or an OpenAI, Gemini or OpenRouter key.";

/** Why a reference image isn't sent to this provider, in words the studio can show. */
export const referenceUnsupported = (kind: ProviderKind) =>
  `Matching a reference photo needs an AI provider that is confirmed to read two images at once. ${PROVIDER_NAME[kind]} hasn't confirmed that yet, so Hairpin won't send the reference there.`;


/**
 * Turns a validated target into a plan. The server resolves `look` from its own catalog; this never sees a URL.
 * A reference-based target on a provider without access is refused with an explicit alternative,
 * never quietly downgraded to text.
 */
export function planTryon(input: {
  target: TryonTarget;
  provider: ProviderKind;
  publikTrial?: boolean;
  look: LookFacts | null;
  tweak: string | null;
}): TryonPlan {
  const { target, provider, look, tweak } = input;

  if (PROVIDER_CAPABILITY[provider] === "no_image_output") {
    return { ok: false, status: 409, code: "provider_cannot_render", message: CANNOT_RENDER };
  }

  if ((target.kind === "catalog-reference" || target.kind === "catalog-describe") && !look) {
    return { ok: false, status: 404, code: "unknown_look", message: "That look isn't in the library anymore. Pick another one." };
  }

  if (usesReferenceImage(target.kind)) {
    const access = referenceAccess(provider, input.publikTrial);
    if (!access.allowed) {
      return {
        ok: false,
        status: 409,
        code: "reference_unsupported",
        message: referenceUnsupported(provider),
        alternative: target.kind === "catalog-reference" ? "catalog-describe" : "text",
      };
    }
    const name = target.kind === "catalog-reference" ? look!.name : target.kind === "upload" ? target.name : null;
    return {
      ok: true,
      mode: target.kind,
      imageCount: 2,
      // During the publik trial the prompt is "blind": no style name or description, so a matching result can only
      // have come from the reference image. That is what makes the trial evidence of two-image support.
      prompt: access.experimental ? referencePrompt(null, null, tweak) : referencePrompt(target.kind === "catalog-reference" ? look : null, name, tweak),
      label: name ?? "Your screenshot",
      experimental: access.experimental,
    };
  }

  if (target.kind === "catalog-describe") {
    const l = look!;
    const description = `${l.name}: ${l.length} length, ${l.texture} texture. ${l.notes}`;
    return { ok: true, mode: target.kind, imageCount: 1, prompt: describePrompt(description, tweak), label: l.name, experimental: false };
  }

  if (target.kind !== "text") return { ok: false, status: 400, code: "bad_request", message: "Unknown try-on type." };
  const description = cleanText(target.description, LIMITS.descriptionMax);
  if (description.length < LIMITS.descriptionMin) {
    return { ok: false, status: 400, code: "bad_request", message: "Describe the haircut in a few words." };
  }
  return { ok: true, mode: "text", imageCount: 1, prompt: describePrompt(description, tweak), label: description.slice(0, LIMITS.nameMax), experimental: false };
}

/**
 * The last check before any provider call: the number of images about to be sent must match the plan and the
 * provider's capability. The route calls this with the real image array, so a bug elsewhere can't leak a
 * second image to a provider that isn't cleared for it.
 */
export function assertSendable(provider: ProviderKind, imageCount: number, publikTrial = false): void {
  if (PROVIDER_CAPABILITY[provider] === "no_image_output") throw new Error(`Refusing to send a try-on to ${provider}: it can't make images.`);
  if (imageCount < 1) throw new Error("A try-on needs the person's photo.");
  if (imageCount > 2) throw new Error("A try-on sends at most two images.");
  if (imageCount === 2 && !referenceAccess(provider, publikTrial).allowed) {
    throw new Error(`Refusing to send a reference image to ${provider}: multi-image editing is not verified.`);
  }
}

/* ---------- prompts ---------- */

const KEEP =
  "Keep everything else from image 1 exactly as it is: the person's identity and facial features, skin and skin tone, facial hair, makeup, pose, expression, clothing, accessories, background, lighting and framing. Keep the person's own natural hair colour. Photorealistic.";

function tweakLine(tweak: string | null) {
  return tweak ? `Then adjust the cut: ${tweak.toLowerCase()}.` : "";
}

function referencePrompt(look: LookFacts | null, name: string | null, tweak: string | null) {
  const hint = look ? ` The reference style is "${look.name}" (${look.length} length, ${look.texture} texture).` : name ? ` The person calls this style "${name}".` : "";
  return [
    "Image 1 is the person. Image 2 is a hairstyle reference and nothing else.",
    `Edit image 1 so the person has the haircut shown in image 2: match its shape, length, texture, parting, volume and styling.${hint}`,
    "Take only the hairstyle from image 2. Do not copy anything else from image 2: not the face, identity, skin tone, age, expression, makeup, facial hair, body, clothing, accessories, hair colour, background or lighting.",
    tweakLine(tweak),
    KEEP,
  ]
    .filter(Boolean)
    .join(" ");
}

function describePrompt(description: string, tweak: string | null) {
  return [`Change only the hair of the person in image 1 to this hairstyle: ${description}`, tweakLine(tweak), KEEP].filter(Boolean).join(" ");
}
