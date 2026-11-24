import { errorResponse } from "@/lib/api-error";
import { resetLibrary } from "@/lib/library-model";
import { writeLibrary } from "@/lib/library-store.server";
import { deletePublikRecord } from "@/lib/publik-gate";
import { posts, postsAvailable } from "@/lib/posts.server";
import { deleteRenderRecords } from "@/lib/render-guard.server";
import { verifyCaller } from "@/lib/server-auth";

/**
 * DELETE /api/account: removes every server record Hairpin keeps for the verified caller, before the client deletes
 * the Firebase account itself. Only the uid from the token is used; no account can be named.
 *
 *  - hairpin:library:<uid>        saved looks and boards. Replaced by a content-free reset marker that expires after
 *                                 2 hours, longer than any ID token stays valid, so a stale device can't re-create it.
 *  - publik:user:<uid>            the link to the person's publik install and its key.
 *  - hairpin:render:* / allow:*   the render lock and this window's, day's and month's counters (others expire).
 *  - hairpin:post:* / posts:by:*  every cut the person shared publicly, with its stored image (Vercel Blob).
 * Not per account, so not deleted: free try-on counts (keyed by a salted IP hash) and the app-wide daily totals.
 */
export async function DELETE(request: Request) {
  const uid = await verifyCaller(request);
  if (!uid) return errorResponse(401, { code: "signed_out", message: "Please sign in again." });
  const failed: string[] = [];
  const steps: [string, () => Promise<unknown>][] = [
    ["library", () => writeLibrary(uid, resetLibrary(Date.now()), 2 * 3600)],
    ["publik", () => deletePublikRecord(uid)],
    ["counters", () => deleteRenderRecords(uid)],
    ["posts", async () => void (postsAvailable() && (await posts().removeAllFor(uid)))],
  ];
  for (const [name, run] of steps) {
    try {
      await run();
    } catch {
      failed.push(name);
    }
  }
  if (failed.length) {
    return errorResponse(503, { code: "delete_incomplete", message: "Some of your account data couldn't be deleted right now. Nothing else was changed; please try again." });
  }
  return Response.json({ deleted: steps.map(([n]) => n) }, { headers: { "Cache-Control": "no-store, private" } });
}
