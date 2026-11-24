import "server-only";
import { real } from "./env";

/**
 * The single server-side door to the Publik API. Each call runs on the
 * signed-in person's own publik key, which lib/publik.server.ts creates for
 * them and lib/publik-gate.ts hands to the route. Never import this from a
 * client component.
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

/** The public Publik endpoint; PUBLIK_API_BASE_URL only needs setting to point somewhere else. */
const baseUrl = () => real(process.env.PUBLIK_API_BASE_URL) ?? "https://publikhq.com/api/v1";

async function call<T>(key: string, path: string, init: RequestInit): Promise<PublikResult<T>> {
  const base = baseUrl();

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

export function generateImage(key: string, input: { prompt: string; size?: string; model?: string }) {
  return call<ImageResponse>(key, "/images/generations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

/** `images` are sent in order: the person photo first, then any reference. */
export function editImage(key: string, input: { prompt: string; images: Blob[]; size?: string; model?: string }) {
  const form = new FormData();
  form.set("prompt", input.prompt);
  if (input.size) form.set("size", input.size);
  if (input.model) form.set("model", input.model);
  input.images.forEach((image, i) => {
    const ext = image.type === "image/png" ? "png" : image.type === "image/webp" ? "webp" : "jpg";
    form.append("image[]", image, `${i === 0 ? "selfie" : "hairstyle-reference"}.${ext}`);
  });
  return call<ImageResponse>(key, "/images/edits", { method: "POST", body: form });
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
export function chat(key: string, input: ChatInput) {
  return call<ChatResponse>(key, "/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: input.tier,
      messages: chatMessages(input),
      ...(input.json ? { response_format: { type: "json_object" } } : {}),
    }),
  });
}
