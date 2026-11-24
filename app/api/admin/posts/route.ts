import { errorResponse } from "@/lib/api-error";
import { isPostId, publicView } from "@/lib/posts-model";
import { isAdmin, posts, postsAvailable } from "@/lib/posts.server";
import { verifyCaller } from "@/lib/server-auth";

/**
 * Review queue for community cuts. Only uids listed in HAIRPIN_ADMIN_UIDS may call it; everyone else gets 403.
 *   GET   -> { queue, usage }        pending and auto-held posts, plus storage use
 *   POST  { id, action }             action: "approve" | "reject" | "remove"
 */
const noStore = { "Cache-Control": "no-store, private" };

async function admin(request: Request) {
  const uid = await verifyCaller(request);
  if (!uid) return { response: errorResponse(401, { code: "signed_out", message: "Please sign in again." }) };
  if (!isAdmin(uid)) return { response: errorResponse(403, { code: "forbidden", message: "This page is only for reviewers." }) };
  if (!postsAvailable()) return { response: errorResponse(503, { code: "share_unavailable", message: "Sharing isn't configured." }) };
  return { uid };
}

export async function GET(request: Request) {
  const a = await admin(request);
  if (!a.uid) return a.response;
  try {
    const [queue, usage] = await Promise.all([posts().queue(50), posts().usage()]);
    return Response.json({ queue: queue.map((p) => ({ ...publicView(p, null), status: p.status })), usage }, { headers: noStore });
  } catch {
    return errorResponse(503, { code: "share_unavailable", message: "The store didn't answer." });
  }
}

export async function POST(request: Request) {
  const a = await admin(request);
  if (!a.uid) return a.response;
  const body = (await request.json().catch(() => null)) as { id?: unknown; action?: unknown } | null;
  if (!isPostId(body?.id) || !["approve", "reject", "remove"].includes(String(body?.action))) return errorResponse(400, { code: "bad_request", message: "Not understood." });
  try {
    const result = body.action === "remove" ? await posts().remove(body.id, a.uid, true) : await posts().decide(body.id, body.action === "approve" ? "approved" : "rejected");
    if (!result.ok) return errorResponse(result.status, { code: result.code, message: result.message });
    return Response.json({ ok: true }, { headers: noStore });
  } catch {
    return errorResponse(503, { code: "share_unavailable", message: "The store didn't answer." });
  }
}
