import "server-only";

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

export const publikConfigured = Boolean(process.env.PUBLIK_API_BASE_URL && process.env.PUBLIK_API_KEY);

async function call<T>(path: string, init: RequestInit): Promise<PublikResult<T>> {
  const base = process.env.PUBLIK_API_BASE_URL;
  const key = process.env.PUBLIK_API_KEY;
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
