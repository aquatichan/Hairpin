import "server-only";
import { FreeTryonsOnlyError, NoImageError, OwnKeyError } from "./ai";
import { AnthropicKeyError, AnthropicRefusalError } from "./anthropic.server";
import { PublikError } from "./publik";

export type ApiError = { code: string; message: string; topUpUrl?: string };

export function errorResponse(status: number, error: ApiError) {
  return Response.json({ error }, { status });
}

/** Maps a failure to a safe client error. On a 402 only Publik's own message and top-up link are passed on. */
export function publikFailure(e: unknown) {
  if (e instanceof OwnKeyError) return errorResponse(e.free ? 503 : 400, { code: e.free ? "free_unavailable" : "own_key_failed", message: e.message });
  if (e instanceof AnthropicKeyError) return errorResponse(400, { code: "own_key_failed", message: e.message });
  if (e instanceof AnthropicRefusalError) return errorResponse(422, { code: "declined", message: e.message });
  if (e instanceof NoImageError) return errorResponse(422, { code: "no_image", message: e.message });
  if (e instanceof FreeTryonsOnlyError) return errorResponse(403, { code: "free_tryons_only", message: e.message });
  if (e instanceof PublikError) {
    if (e.status === 402) return errorResponse(402, { code: "payment_required", message: e.message, topUpUrl: e.topUpUrl });
    if (e.status === 503) return errorResponse(503, { code: "publik_busy", message: "publik is busy right now. Please try again in a moment." });
  }
  return errorResponse(502, { code: "render_failed", message: "That didn't work. Please try again." });
}
