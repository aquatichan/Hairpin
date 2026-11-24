import { errorResponse } from "@/lib/api-error";
import { LIBRARY_LIMITS, clampLibrary, mergeLibraries, resetLibrary, sanitizeLibrary } from "@/lib/library-model";
import { isKnownLook, librarySyncAvailable, readLibrary, writeLibrary } from "@/lib/library-store.server";
import { verifyCaller } from "@/lib/server-auth";

/**
 * The signed-in person's saved looks and boards (see lib/library-model.ts). Every call is scoped to the uid in the
 * verified Firebase ID token; there is no way to name another account. No publik gate: nothing here uses AI.
 *
 *   GET     -> { library: Library | null }
 *   PUT     { library }  -> { library }   merged with the stored copy under the conflict policy; the merge is returned.
 *   DELETE  -> 204                        "Delete all my data": leaves only a content-free reset marker.
 */
const noStore = { "Cache-Control": "no-store, private" };
/** Every answer carries the server's clock, which devices use to order their edits. */
const withTime = (body: object) => ({ ...body, serverTime: Date.now() });

async function caller(request: Request) {
  const uid = await verifyCaller(request);
  if (!uid) return { response: errorResponse(401, { code: "signed_out", message: "Please sign in again." }) };
  if (!librarySyncAvailable()) return { response: errorResponse(503, { code: "sync_unavailable", message: "Saving to your account isn't available right now." }) };
  return { uid };
}

const storeDown = () => errorResponse(503, { code: "sync_unavailable", message: "Saving to your account isn't available right now." });

export async function GET(request: Request) {
  const c = await caller(request);
  if (!c.uid) return c.response;
  try {
    return Response.json(withTime({ library: await readLibrary(c.uid) }), { headers: noStore });
  } catch {
    return storeDown();
  }
}

export async function PUT(request: Request) {
  const c = await caller(request);
  if (!c.uid) return c.response;
  const text = await request.text().catch(() => "");
  if (text.length > LIBRARY_LIMITS.bytes) return errorResponse(413, { code: "too_large", message: "That's more than Hairpin can save at once." });
  let body: { library?: unknown; base?: unknown } | null = null;
  try {
    body = JSON.parse(text);
  } catch {}
  const incoming = sanitizeLibrary(body?.library, isKnownLook);
  if (!incoming) return errorResponse(400, { code: "bad_request", message: "That isn't a valid library." });

  try {
    const stored = await readLibrary(c.uid);
    // Always merged: the conflict policy in lib/library-model.ts decides, so the order writes arrive in doesn't matter
    // and a stale device can't undo a removal it never saw.
    const now = Date.now();
    const safe = clampLibrary(incoming, now);
    const next = { ...(stored ? mergeLibraries(stored, safe, now) : safe), updatedAt: now };
    await writeLibrary(c.uid, next);
    return Response.json(withTime({ library: next }), { headers: noStore });
  } catch {
    return storeDown();
  }
}

export async function DELETE(request: Request) {
  const c = await caller(request);
  if (!c.uid) return c.response;
  try {
    // The account's looks and boards are deleted. What stays is a content-free marker, `resetAt`, so a device that was
    // offline during the delete can't push the old library back.
    await writeLibrary(c.uid, resetLibrary(Date.now()));
    return new Response(null, { status: 204, headers: noStore });
  } catch {
    return storeDown();
  }
}
