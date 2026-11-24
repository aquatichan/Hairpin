import { errorResponse } from "@/lib/api-error";
import { isPostId } from "@/lib/posts-model";
import { posts, postsAvailable } from "@/lib/posts.server";
import { verifyCaller } from "@/lib/server-auth";

/**
 * PUT /api/posts/<id>/save { on }: counts one save per person toward a cut's popularity. Only the count is kept; who
 * saved what stays in each person's own saved looks. Failing quietly is fine: the save itself is private and local.
 */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const uid = await verifyCaller(request);
  if (!uid) return errorResponse(401, { code: "signed_out", message: "Please sign in again." });
  const { id } = await params;
  if (!isPostId(id) || !postsAvailable()) return errorResponse(404, { code: "not_found", message: "That cut isn't available." });
  const body = (await request.json().catch(() => null)) as { on?: unknown } | null;
  try {
    const saves = await posts().setSaved(id, uid, body?.on !== false);
    return Response.json({ saves }, { headers: { "Cache-Control": "no-store, private" } });
  } catch {
    return errorResponse(503, { code: "share_unavailable", message: "Try again in a moment." });
  }
}
