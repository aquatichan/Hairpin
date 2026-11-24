import "server-only";
import * as publik from "./publik";
import { PublikError } from "./publik";
import type { z } from "zod";
import { VENDOR_INFO, type Vendor } from "./ai-vendors";
import { anthropicJson } from "./anthropic.server";
import type { ProviderKind } from "./tryon-plan";

/**
 * Provider routing. Each request runs on the key lib/publik-gate.ts resolved for the signed-in person:
 *  - publik: their publik key (Connect your plan);
 *  - own: a key of their own for one provider (lib/ai-vendors.ts), sent with each request and never stored;
 *  - free: the app's own key, only for the limited free try-ons (lib/free-tryons.server.ts).
 */
export type AiProvider = { kind: "publik"; apiKey: string } | { kind: "own"; vendor: Vendor; apiKey: string } | { kind: "free"; vendor: Vendor; apiKey: string };
export type Provider = AiProvider["kind"];
type Result<T> = { data: T; chargeMicros: number | null; provider: Provider };

/** The capability row (lib/tryon-plan.ts) a provider's image edits fall under. */
export const editKind = (p: AiProvider): ProviderKind => (p.kind === "publik" ? "publik" : p.vendor);

/**
 * A provider refused or failed a request made with a person's own key, or with the app's free-try-on key.
 * Own-key problems are the person's to fix, so the message says so; free-key problems never blame them.
 */
export class OwnKeyError extends Error {
  constructor(
    readonly status: number,
    readonly vendor: Vendor,
    readonly free = false,
  ) {
    const name = VENDOR_INFO[vendor].label;
    super(
      free
        ? "Free try-ons aren't available right now. Please try again later, or use a publik plan or your own key."
        : status === 401 || status === 403
          ? `${name} refused your key. Check it under You, then AI.`
          : status === 402 || status === 429
            ? `Your ${name} account is out of credit or rate-limited.`
            : `${name} couldn't do that with your key. Please try again.`,
    );
  }
}

/** The provider answered without an image, e.g. it declined this photo. */
export class NoImageError extends Error {
  constructor() {
    super("The AI didn't return an image. It may have declined this photo; try another photo or style.");
  }
}

async function call<T>(p: Exclude<AiProvider, { kind: "publik" }>, url: string, init: RequestInit, auth: Record<string, string>): Promise<T> {
  const res = await fetch(url, { ...init, headers: { ...init.headers, ...auth }, cache: "no-store" });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    // Gemini answers 400 "API key not valid" for a bad key.
    const keyRefused = res.status === 400 && /api key/i.test(String(body?.error?.message ?? ""));
    throw new OwnKeyError(keyRefused ? 401 : res.status, p.vendor, p.kind === "free");
  }
  return body as T;
}

const bearer = (key: string) => ({ Authorization: `Bearer ${key}` });
const b64 = async (blob: Blob) => Buffer.from(await blob.arrayBuffer()).toString("base64");
const dataUrl = async (blob: Blob) => `data:${blob.type || "image/jpeg"};base64,${await b64(blob)}`;

/**
 * Default image models. OpenAI: gpt-image-1 was shut down on 2026-10-23; gpt-image-2.6-sunburst is the documented
 * default for /v1/images/edits. Gemini: "Recommended for all new projects to use Nano Banana 2.1". OpenRouter: its
 * OpenAI image model. Each can be overridden by env.
 */
const MODELS = {
  openaiImage: () => process.env.OPENAI_IMAGE_MODEL?.trim() || "gpt-image-2.6-sunburst",
  openaiChat: () => process.env.OPENAI_CHAT_MODEL?.trim() || "gpt-4o-mini",
  geminiImage: () => process.env.GEMINI_IMAGE_MODEL?.trim() || "gemini-nano-banana-2.1",
  geminiChat: () => process.env.GEMINI_CHAT_MODEL?.trim() || "gemini-3.8-flash",
  openrouterImage: () => process.env.OPENROUTER_IMAGE_MODEL?.trim() || "openai/gpt-image-2",
  openrouterChat: () => process.env.OPENROUTER_CHAT_MODEL?.trim() || "openrouter/auto",
};

/** Names the multipart parts so the provider sees "selfie" first and "hairstyle-reference" second. */
export function imageFileName(index: number, type: string) {
  const ext = type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
  return `${index === 0 ? "selfie" : "hairstyle-reference"}.${ext}`;
}

type GeminiInteraction = { status?: string; steps?: { type?: string; content?: { type?: string; data?: string; mime_type?: string }[] }[] };
type OpenRouterImages = { data?: { b64_json?: string; url?: string }[] };

/** `images` are sent in order: the person's photo first, then any hairstyle reference. Callers check capability first (lib/tryon-plan.ts). */
export async function editImage(provider: AiProvider, input: { prompt: string; images: Blob[] }): Promise<Result<publik.ImageResponse>> {
  if (provider.kind === "publik") return { ...(await publik.editImage(provider.apiKey, input)), provider: "publik" };
  const result = (data: publik.ImageResponse) => ({ data, chargeMicros: null, provider: provider.kind });

  if (provider.vendor === "openai") {
    const form = new FormData();
    form.set("model", MODELS.openaiImage());
    form.set("prompt", input.prompt);
    form.set("n", "1");
    form.set("quality", "medium");
    input.images.forEach((image, i) => form.append("image[]", image, imageFileName(i, image.type)));
    return result(await call<publik.ImageResponse>(provider, "https://api.openai.com/v1/images/edits", { method: "POST", body: form }, bearer(provider.apiKey)));
  }

  if (provider.vendor === "anthropic") throw new NoImageError(); // never planned: lib/tryon-plan.ts refuses it first

  if (provider.vendor === "gemini") {
    // Interactions API (aistudio.google.com/docs/image-generation). store:false: Google keeps no copy of the
    // person's photo for later retrieval (stored for up to 55 days otherwise).
    const body = {
      model: MODELS.geminiImage(),
      store: false,
      input: [{ type: "text", text: input.prompt }, ...(await Promise.all(input.images.map(async (img) => ({ type: "image", mime_type: img.type || "image/jpeg", data: await b64(img) }))))],
    };
    const out = await call<GeminiInteraction>(
      provider,
      "https://generativelanguage.googleapis.com/v1beta/interactions",
      { method: "POST", headers: { "Content-Type": "application/json", "Api-Revision": "2026-05-20" }, body: JSON.stringify(body) },
      { "x-goog-api-key": provider.apiKey },
    );
    const image = out.steps?.filter((s) => s.type === "model_output").flatMap((s) => s.content ?? []).find((c) => c.type === "image" && c.data);
    if (!image?.data) throw new NoImageError();
    return result({ data: [{ b64_json: image.data }] });
  }

  // OpenRouter Image API (openrouter.ai/docs/features/multimodal/image-generation). Only one input is planned here.
  const out = await call<OpenRouterImages>(
    provider,
    "https://openrouter.ai/api/v1/images",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODELS.openrouterImage(),
        prompt: input.prompt,
        n: 1,
        input_references: await Promise.all(input.images.map(async (img) => ({ type: "image_url", image_url: { url: await dataUrl(img) } }))),
        // Skip endpoints that train on requests.
        provider: { data_collection: "deny" },
      }),
    },
    bearer(provider.apiKey),
  );
  const first = out.data?.[0];
  if (!first?.b64_json) throw new NoImageError();
  return result({ data: [{ b64_json: first.b64_json }] });
}

/** `schema` is the reply's shape. Anthropic enforces it with structured outputs; the others are asked for JSON and parsed by the caller. */
export type ChatInput = { tier: "publik-fast" | "publik-balanced"; system: string; user: string; imageDataUrl?: string; json?: boolean; schema?: z.ZodType };

/** Decode and Barber Briefs. Not part of free try-ons. */
export async function chat(provider: AiProvider, input: ChatInput): Promise<Result<publik.ChatResponse>> {
  if (provider.kind === "publik") return { ...(await publik.chat(provider.apiKey, input)), provider: "publik" };
  if (provider.kind === "free") throw new FreeTryonsOnlyError();
  if (provider.vendor === "anthropic") {
    if (!input.schema) throw new OwnKeyError(400, "anthropic");
    const parsed = await anthropicJson(provider.apiKey, { system: input.system, user: input.user, imageDataUrl: input.imageDataUrl, schema: input.schema });
    return { data: { choices: [{ message: { content: JSON.stringify(parsed) } }] }, chargeMicros: null, provider: "own" };
  }
  const messages = publik.chatMessages(input);
  const json = (s: unknown) => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(s) });

  let data: publik.ChatResponse;
  if (provider.vendor === "openai") {
    data = await call(provider, "https://api.openai.com/v1/chat/completions", json({ model: MODELS.openaiChat(), messages, ...(input.json ? { response_format: { type: "json_object" } } : {}) }), bearer(provider.apiKey));
  } else if (provider.vendor === "gemini") {
    // Gemini's OpenAI-compatible endpoint (aistudio.google.com/docs/openai). JSON mode isn't documented there, so the
    // prompt asks for JSON and callers parse it with extractJson.
    data = await call(provider, "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", json({ model: MODELS.geminiChat(), messages }), bearer(provider.apiKey));
  } else {
    data = await call(provider, "https://openrouter.ai/api/v1/chat/completions", json({ model: MODELS.openrouterChat(), messages, provider: { data_collection: "deny" } }), bearer(provider.apiKey));
  }
  return { data, chargeMicros: null, provider: "own" };
}

/** Free try-ons pay for try-ons only; Decode and Briefs need a plan or a key. */
export class FreeTryonsOnlyError extends Error {
  constructor() {
    super("Free try-ons cover try-ons only. Decode and Barber Briefs need a publik plan or your own key.");
  }
}

export { PublikError };

/** Pulls the first JSON object out of a model reply. */
export function extractJson(text: string): unknown {
  try {
    return JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
  } catch {
    return null;
  }
}
