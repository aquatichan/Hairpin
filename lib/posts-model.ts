/**
 * Community posts: the data model, limits and validation. Pure and import-free (vocabularies are passed in by the
 * caller) so the server, the client and `node --test` all share the same rules.
 *
 * A post is a cut someone chose to share publicly. Nothing is public until an admin approves it. The uploader's uid
 * never leaves the server: clients only see `ownerKey`, a one-way short hash, which the feed uses for diversity.
 */
export const POST_LIMITS = Object.freeze({
  dailyUploads: 5,
  livePerUser: 30,
  /** After server re-encoding. The browser pipeline already targets ~120 KB. */
  imageBytes: 250_000,
  /** Soft stop on total stored bytes (of a 1 GB allowance), so uploads pause instead of overrunning. */
  softBytes: 800_000_000,
  /** Distinct reporters that automatically take an approved post down for review. */
  reportHold: 3,
  name: 60,
  description: 280,
  tags: 6,
  page: 24,
});

export type PostStatus = "pending" | "approved" | "rejected" | "held";
export type PostFields = {
  name: string;
  description: string;
  audience: "men" | "women" | "any";
  length: "short" | "medium" | "long";
  hairType: string;
  tags: string[];
};

/** Server record. `uid` and `blobUrl` stay on the server. */
export type Post = PostFields & {
  id: string;
  uid: string;
  ownerKey: string;
  width: number;
  height: number;
  /** Where the image is served from (Blob URL, or a local route in development). */
  image: string;
  bytes: number;
  status: PostStatus;
  createdAt: number;
  approvedAt: number | null;
  saves: number;
};

/** What a client may see. */
export type PublicPost = PostFields & {
  id: string;
  ownerKey: string;
  width: number;
  height: number;
  image: string;
  createdAt: number;
  saves: number;
  /** Only set when the viewer is the uploader. */
  status?: PostStatus;
  mine?: boolean;
};

export const POST_ID = /^p-[a-f0-9]{12}$/;
export const isPostId = (v: unknown): v is string => typeof v === "string" && POST_ID.test(v);
export const newPostId = (randomHex: string) => `p-${randomHex.slice(0, 12)}`;

/** Control, format (bidi, zero-width) and line characters out; whitespace collapsed; length capped. */
export const cleanText = (v: unknown, max: number): string =>
  typeof v === "string"
    ? v
        .replace(/[\p{Cc}\p{Cf}\u2028\u2029]/gu, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, max)
    : "";

export type Vocab = { audiences: readonly string[]; lengths: readonly string[]; hairTypes: readonly string[]; tags: readonly string[] };

export function cleanPostFields(raw: Record<string, unknown>, vocab: Vocab): { ok: true; fields: PostFields } | { ok: false; message: string } {
  const name = cleanText(raw.name, POST_LIMITS.name);
  if (!name) return { ok: false, message: "Give the cut a name." };
  const description = cleanText(raw.description, POST_LIMITS.description);
  const audience = String(raw.audience ?? "");
  if (!vocab.audiences.includes(audience)) return { ok: false, message: "Choose who the cut is for." };
  const length = String(raw.length ?? "");
  if (!vocab.lengths.includes(length)) return { ok: false, message: "Choose a length." };
  const hairType = String(raw.hairType ?? "");
  if (!vocab.hairTypes.includes(hairType)) return { ok: false, message: "Choose the hair type shown." };
  let tagList: unknown = raw.tags;
  if (typeof tagList === "string") {
    try {
      tagList = JSON.parse(tagList);
    } catch {
      tagList = [];
    }
  }
  const tags = Array.isArray(tagList) ? [...new Set(tagList.filter((t): t is string => typeof t === "string" && vocab.tags.includes(t)))].slice(0, POST_LIMITS.tags) : [];
  return { ok: true, fields: { name, description, audience: audience as PostFields["audience"], length: length as PostFields["length"], hairType, tags } };
}

/** Who may see a post: everyone once approved; otherwise only the uploader. */
export const canView = (post: Post, viewerUid: string | null) => post.status === "approved" || (viewerUid !== null && post.uid === viewerUid);

export function publicView(post: Post, viewerUid: string | null): PublicPost {
  const mine = viewerUid !== null && post.uid === viewerUid;
  // Listed field by field so a field added to Post later is private by default.
  const view: PublicPost = {
    id: post.id,
    name: post.name,
    description: post.description,
    audience: post.audience,
    length: post.length,
    hairType: post.hairType,
    tags: post.tags,
    ownerKey: post.ownerKey,
    width: post.width,
    height: post.height,
    image: post.image,
    createdAt: post.createdAt,
    saves: post.saves,
  };
  return mine ? { ...view, status: post.status, mine: true } : view;
}

/** Whether the aspect ratio is sane for a portrait-style cut (rejects slivers and panoramas). */
export const sensibleShape = (w: number, h: number) => w >= 200 && h >= 200 && w / h >= 0.4 && w / h <= 2.5;
