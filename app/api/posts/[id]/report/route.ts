import { errorResponse } from "@/lib/api-error";
import { isPostId } from "@/lib/posts-model";
import { posts, postsAvailable } from "@/lib/posts.server";
import { verifyCaller } from "@/lib/server-auth";

/** POST /api/posts/<id>/report: flags a live cut for review. Enough distinct reports take it down automatically. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const uid = await verifyCaller(request);
  if (!uid) return errorResponse(401, { code: "signed_out", message: "Please sign in again." });
  const { id } = await params;
  if (!isPostId(id) || !postsAvailable()) return errorResponse(404, { code: "not_found", message: "That cut isn't available." });
  try {
    const result = await posts().report(id, uid);
    if (!result.ok) return errorResponse(result.status, { code: result.code, message: result.message });
    return Response.json({ reported: true }, { headers: { "Cache-Control": "no-store, private" } });
  } catch {
    return errorResponse(503, { code: "share_unavailable", message: "That couldn't be sent right now. Please try again." });
  }
}
