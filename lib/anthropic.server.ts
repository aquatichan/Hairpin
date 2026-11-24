import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";

/**
 * Decode and Barber Briefs on the person's own Anthropic key (Claude can't make images, so no try-ons).
 *
 * Structured outputs: the reply is validated against the route's own zod schema, so callers get exactly the JSON they
 * already expect. Server-side fallbacks ("default") re-run a request Claude's safety classifiers decline on a
 * suitable fallback model inside the same call. ANTHROPIC_MODEL overrides the model.
 */
const MODEL = () => process.env.ANTHROPIC_MODEL?.trim() || "claude-opus-5-5";

export class AnthropicKeyError extends Error {
  constructor(readonly status: number) {
    super(
      status === 401 || status === 403
        ? "Anthropic refused your key. Check it under You, then AI."
        : status === 402 || status === 429
          ? "Your Anthropic account is out of credit or rate-limited."
          : status === 529
            ? "Claude is busy right now. Please try again in a moment."
            : "Anthropic couldn't do that with your key. Please try again.",
    );
  }
}

/** Claude declined the request (stop_reason "refusal"), and so did any fallback. */
export class AnthropicRefusalError extends Error {
  constructor() {
    super("Claude declined to help with this one. Try another photo or wording.");
  }
}

type ImageMedia = "image/jpeg" | "image/png" | "image/webp" | "image/gif";

function imageBlock(dataUrl: string) {
  const match = /^data:(image\/(?:jpeg|png|webp|gif));base64,(.+)$/.exec(dataUrl);
  if (!match) throw new AnthropicKeyError(400);
  return { type: "image" as const, source: { type: "base64" as const, media_type: match[1] as ImageMedia, data: match[2] } };
}

export async function anthropicJson<S extends z.ZodType>(apiKey: string, input: { system: string; user: string; imageDataUrl?: string; schema: S }): Promise<z.infer<S>> {
  // A new client per request: the key belongs to this person and this request only. No retries on their account.
  const client = new Anthropic({ apiKey, maxRetries: 1 });
  try {
    const message = await client.beta.messages.parse({
      model: MODEL(),
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: input.system,
      output_config: { effort: "medium", format: betaZodOutputFormat(input.schema) },
      messages: [
        {
          role: "user",
          content: input.imageDataUrl ? [imageBlock(input.imageDataUrl), { type: "text", text: input.user }] : [{ type: "text", text: input.user }],
        },
      ],
    });
    if (message.stop_reason === "refusal") throw new AnthropicRefusalError();
    if (message.parsed_output === null) throw new AnthropicKeyError(502);
    return message.parsed_output as z.infer<S>;
  } catch (e) {
    if (e instanceof AnthropicRefusalError || e instanceof AnthropicKeyError) throw e;
    if (e instanceof Anthropic.AuthenticationError) throw new AnthropicKeyError(401);
    if (e instanceof Anthropic.PermissionDeniedError) throw new AnthropicKeyError(403);
    if (e instanceof Anthropic.RateLimitError) throw new AnthropicKeyError(429);
    if (e instanceof Anthropic.APIConnectionError) throw new AnthropicKeyError(503);
    if (e instanceof Anthropic.APIError) throw new AnthropicKeyError(e.status ?? 500);
    throw new AnthropicKeyError(500);
  }
}
