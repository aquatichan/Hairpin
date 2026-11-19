import "server-only";
import * as publik from "./publik";
import { PublikError } from "./publik";

/**
 * Provider routing. Each request runs on the key lib/publik-gate.ts resolved
 * for the signed-in person: their publik key (Connect your plan), or the
 * OpenAI key they gave under "Use my own key". There is no shared app key.
 */

export type AiProvider = { kind: "publik" | "own"; apiKey: string };
export type Provider = AiProvider["kind"];
type Result<T> = { data: T; chargeMicros: number | null; provider: Provider };

/** The person's own OpenAI key was refused or OpenAI failed. Their own key's problems are theirs to fix, so the message says so. */
export class OwnKeyError extends Error {
  constructor(readonly status: number) {
    super(
      status === 401
        ? "OpenAI refused your key. Check it under You, then AI."
        : status === 429
          ? "Your OpenAI account is out of credit or rate-limited."
          : "OpenAI couldn't do that with your key. Please try again.",
    );
  }
}

async function openai<T>(apiKey: string, path: string, init: RequestInit): Promise<T> {
  const res = await fetch(`https://api.openai.com/v1${path}`, {
    ...init,
    headers: { ...init.headers, Authorization: `Bearer ${apiKey}` },
    cache: "no-store",
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new OwnKeyError(res.status);
  return body as T;
}

export async function editImage(provider: AiProvider, input: { prompt: string; images: Blob[] }): Promise<Result<publik.ImageResponse>> {
  if (provider.kind === "publik") return { ...(await publik.editImage(provider.apiKey, input)), provider: "publik" };
  const form = new FormData();
  form.set("model", process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-1");
  form.set("prompt", input.prompt);
  for (const image of input.images) form.append("image[]", image, "image.jpg");
  const data = await openai<publik.ImageResponse>(provider.apiKey, "/images/edits", { method: "POST", body: form });
  return { data, chargeMicros: null, provider: "own" };
}

export type ChatInput = { tier: "publik-fast" | "publik-balanced"; system: string; user: string; imageDataUrl?: string; json?: boolean };

export async function chat(provider: AiProvider, input: ChatInput): Promise<Result<publik.ChatResponse>> {
  if (provider.kind === "publik") return { ...(await publik.chat(provider.apiKey, input)), provider: "publik" };
  const data = await openai<publik.ChatResponse>(provider.apiKey, "/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.OPENAI_CHAT_MODEL ?? "gpt-4o-mini",
      messages: publik.chatMessages(input),
      ...(input.json ? { response_format: { type: "json_object" } } : {}),
    }),
  });
  return { data, chargeMicros: null, provider: "own" };
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
