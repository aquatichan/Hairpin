import "server-only";
import { PublikError } from "./publik";

export type ApiError = { code: string; message: string; topUpUrl?: string };

export function errorResponse(status: number, error: ApiError) {
  return Response.json({ error }, { status });
}

/** Maps a failure to a safe client error. On a 402 only Publik's own message and top-up link are passed on. */
export function publikFailure(e: unknown) {
  if (e instanceof PublikError) {
    if (e.status === 402) return errorResponse(402, { code: "payment_required", message: e.message, topUpUrl: e.topUpUrl });
    if (e.status === 503) return errorResponse(503, { code: "not_connected", message: "AI isn't connected in this build yet." });
  }
  return errorResponse(502, { code: "render_failed", message: "That didn't work. Please try again." });
}
