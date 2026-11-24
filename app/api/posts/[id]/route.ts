import { errorResponse } from "@/lib/api-error";
import { isPostId } from "@/lib/posts-model";
import { isAdmin, posts, postsAvailable } from "@/lib/posts.server";
import { verifyCaller } from "@/lib/server-auth";

/** DELETE /api/posts/<id>: the uploader (or an admin) removes a post and its image. */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const uid = await verifyCaller(request);
  if (!uid) return errorResponse(401, { code: "signed_out", message: "Please sign in again." });
  const { id } = await params;
  if (!isPostId(id)) return errorResponse(404, { code: "not_found", message: "That cut isn't available." });
  if (!postsAvailable()) return errorResponse(503, { code: "share_unavailable", message: "Sharing isn't available right now." });
  try {
    const result = await posts().remove(id, uid, isAdmin(uid));
    if (!result.ok) return errorResponse(result.status, { code: result.code, message: result.message });
    return new Response(null, { status: 204, headers: { "Cache-Control": "no-store, private" } });
  } catch {
    return errorResponse(503, { code: "share_unavailable", message: "That couldn't be removed right now. Please try again." });
  }
}
