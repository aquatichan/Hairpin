import "server-only";
import { real } from "./env";

/**
 * The single server-side door to the Publik API. All text and image generation
 * goes through here so that spend is attributed to Publik. Never import this
 * from a client component and never call another AI vendor directly.
 */

export class PublikError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly topUpUrl?: string,
  ) {
    super(message);
  }
}

export type PublikResult<T> = { data: T; chargeMicros: number | null };

export const publikConfigured = Boolean(real(process.env.PUBLIK_API_BASE_URL) && real(process.env.PUBLIK_API_KEY));

async function call<T>(path: string, init: RequestInit): Promise<PublikResult<T>> {
  const base = real(process.env.PUBLIK_API_BASE_URL);
  const key = real(process.env.PUBLIK_API_KEY);
  if (!base || !key) throw new PublikError("Publik is not configured", 503);

  const res = await fetch(`${base.replace(/\/$/, "")}${path}`, {
    ...init,
    headers: { ...init.headers, Authorization: `Bearer ${key}` },
    cache: "no-store",
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new PublikError(body?.error?.message ?? "Publik request failed", res.status, body?.error?.top_up_url);
  }
  const charge = res.headers.get("x-publik-charge-micros");
  return { data: body as T, chargeMicros: charge ? Number(charge) : null };
}

/** Demo mode for local development: no Publik call is made and the UI labels every result as a demo. */
export const publikMock = process.env.PUBLIK_MOCK === "1" && process.env.NODE_ENV !== "production";

export type ImageResponse = { data: { url?: string; b64_json?: string }[] };

export function generateImage(input: { prompt: string; size?: string; model?: string }) {
  return call<ImageResponse>("/images/generations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

/** `images` are sent in order: the person photo first, then any reference. */
export function editImage(input: { prompt: string; images: Blob[]; size?: string; model?: string }) {
  const form = new FormData();
  form.set("prompt", input.prompt);
  if (input.size) form.set("size", input.size);
  if (input.model) form.set("model", input.model);
  for (const image of input.images) form.append("image[]", image);
  return call<ImageResponse>("/images/edits", { method: "POST", body: form });
}

export type ChatResponse = { choices: { message: { content: string } }[] };

type ChatInput = { tier: "publik-fast" | "publik-balanced"; system: string; user: string; imageDataUrl?: string; json?: boolean };

/** OpenAI-shaped messages; an image, when given, rides along with the user turn. */
export function chatMessages(input: ChatInput) {
  return [
    { role: "system", content: input.system },
    {
      role: "user",
      content: input.imageDataUrl
        ? [
            { type: "text", text: input.user },
            { type: "image_url", image_url: { url: input.imageDataUrl } },
          ]
        : input.user,
    },
  ];
}

/** `tier` is a Publik tier name (publik-fast, publik-balanced), never a vendor model name. */
export function chat(input: ChatInput) {
  return call<ChatResponse>("/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: input.tier,
      messages: chatMessages(input),
      ...(input.json ? { response_format: { type: "json_object" } } : {}),
    }),
  });
}
