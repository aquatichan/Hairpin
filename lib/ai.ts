import "server-only";
import { real } from "./env";
import * as publik from "./publik";
import { PublikError } from "./publik";

/**
 * Provider routing. Publik is always tried first, because only Publik spend
 * counts toward the fellowship score. The OpenAI fallback is opt-in
 * (AI_FALLBACK=openai plus OPENAI_API_KEY) and is only used when Publik is not
 * configured or fails with something other than a billing error.
 */

const fallbackOn = () => process.env.AI_FALLBACK === "openai" && Boolean(real(process.env.OPENAI_API_KEY));
export const aiConfigured = () => publik.publikConfigured || fallbackOn();

export type Provider = "publik" | "openai";
type Result<T> = { data: T; chargeMicros: number | null; provider: Provider };

async function openai<T>(path: string, init: RequestInit): Promise<T> {
  const res = await fetch(`https://api.openai.com/v1${path}`, {
    ...init,
    headers: { ...init.headers, Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    cache: "no-store",
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new PublikError("The AI provider request failed", res.status === 402 ? 502 : res.status);
  return body as T;
}

async function route<T>(primary: () => Promise<publik.PublikResult<T>>, fallback: () => Promise<T>): Promise<Result<T>> {
  if (publik.publikConfigured) {
    try {
      return { ...(await primary()), provider: "publik" };
    } catch (e) {
      // A 402 means the user needs to top up with Publik: never route around it.
      if (!fallbackOn() || (e instanceof PublikError && e.status === 402)) throw e;
    }
  }
  if (!fallbackOn()) throw new PublikError("AI is not configured", 503);
  return { data: await fallback(), chargeMicros: null, provider: "openai" };
}

export function editImage(input: { prompt: string; images: Blob[] }) {
  return route(
    () => publik.editImage(input),
    () => {
      const form = new FormData();
      form.set("model", process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-1");
      form.set("prompt", input.prompt);
      for (const image of input.images) form.append("image[]", image, "image.jpg");
      return openai<publik.ImageResponse>("/images/edits", { method: "POST", body: form });
    },
  );
}

export type ChatInput = { tier: "publik-fast" | "publik-balanced"; system: string; user: string; imageDataUrl?: string; json?: boolean };

export function chat(input: ChatInput) {
  return route(
    () => publik.chat(input),
    () =>
      openai<publik.ChatResponse>("/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: process.env.OPENAI_CHAT_MODEL ?? "gpt-4o-mini",
          messages: publik.chatMessages(input),
          ...(input.json ? { response_format: { type: "json_object" } } : {}),
        }),
      }),
  );
}

/** Pulls the first JSON object out of a model reply. */
export function extractJson(text: string): unknown {
  try {
    return JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
  } catch {
    return null;
  }
}
