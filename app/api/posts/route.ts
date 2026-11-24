import { errorResponse } from "@/lib/api-error";
import { POST_LIMITS, cleanPostFields, isPostId, publicView } from "@/lib/posts-model";
import { VOCAB, newId, ownerKey, posts, postsAvailable, reencode } from "@/lib/posts.server";
import { verifyCaller } from "@/lib/server-auth";

/**
 * Community cuts. Every call is scoped to the verified Firebase uid.
 *
 *   GET  /api/posts?cursor=<n>   approved posts, newest first            -> { posts, next }
 *   GET  /api/posts?mine=1       the caller's own posts in every state    -> { posts }
 *   GET  /api/posts?ids=a,b      specific posts the caller may see        -> { posts }
 *   POST /api/posts              multipart: image + fields; stored pending until an admin approves it
 */
const noStore = { "Cache-Control": "no-store, private" };
const unavailable = () => errorResponse(503, { code: "share_unavailable", message: "Sharing isn't available right now. Your cut is still saved privately on this device." });

export async function GET(request: Request) {
  const uid = await verifyCaller(request);
  if (!uid) return errorResponse(401, { code: "signed_out", message: "Please sign in again." });
  if (!postsAvailable()) return Response.json({ posts: [], next: null, unavailable: true }, { headers: noStore });
  const url = new URL(request.url);
  try {
    const repo = posts();
    if (url.searchParams.get("mine") === "1") {
      return Response.json({ posts: (await repo.listMine(uid)).map((p) => publicView(p, uid)) }, { headers: noStore });
    }
    const ids = url.searchParams.get("ids");
    if (ids !== null) {
      const list = ids.split(",").filter(isPostId);
      return Response.json({ posts: (await repo.getMany(list, uid)).map((p) => publicView(p, uid)) }, { headers: noStore });
    }
    const raw = url.searchParams.get("cursor");
    const cursor = raw === null ? null : Number(raw);
    if (cursor !== null && !Number.isFinite(cursor)) return errorResponse(400, { code: "bad_request", message: "That page isn't valid." });
    const page = await repo.listApproved(cursor, POST_LIMITS.page);
    return Response.json({ posts: page.posts.map((p) => publicView(p, uid)), next: page.next }, { headers: noStore });
  } catch {
    return unavailable();
  }
}

export async function POST(request: Request) {
  const uid = await verifyCaller(request);
  if (!uid) return errorResponse(401, { code: "signed_out", message: "Please sign in again." });
  if (!postsAvailable()) return unavailable();
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return errorResponse(400, { code: "bad_request", message: "That upload wasn't understood." });
  }
  const file = form.get("image");
  if (!(file instanceof Blob)) return errorResponse(400, { code: "bad_request", message: "Add a photo." });
  const raw = Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === "string"));
  const fields = cleanPostFields(raw, VOCAB);
  if (!fields.ok) return errorResponse(400, { code: "bad_request", message: fields.message });
  // The consent the person ticked in the app: required for anything that becomes public.
  if (raw.consent !== "yes") return errorResponse(400, { code: "consent_required", message: "Confirm the photo is yours (or you have permission) and that you're happy for it to be shown to other members." });
  const image = await reencode(file);
  if (!image.ok) return errorResponse(422, { code: "bad_image", message: image.message });
  const result = await posts().create({ id: newId(), uid, ownerKey: ownerKey(uid), fields: fields.fields, image: image.image });
  if (!result.ok) return errorResponse(result.status, { code: result.code, message: result.message });
  return Response.json({ post: publicView(result.post, uid) }, { status: 201, headers: noStore });
}

/** DELETE /api/posts: removes everything the caller has shared (used by "Delete all my data"). */
export async function DELETE(request: Request) {
  const uid = await verifyCaller(request);
  if (!uid) return errorResponse(401, { code: "signed_out", message: "Please sign in again." });
  if (!postsAvailable()) return new Response(null, { status: 204 });
  try {
    await posts().removeAllFor(uid);
    return new Response(null, { status: 204, headers: noStore });
  } catch {
    return unavailable();
  }
}
