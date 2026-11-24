/**
 * The shared vocabulary for looks and profiles: face shapes, who a cut is browsed by ("Show me"), and the controlled
 * list of style tags. Dependency-free, so the client, the server, scripts/build-looks.mjs and `node --test` all use it.
 */

export const FACE_SHAPES = ["oval", "round", "square", "heart", "oblong", "diamond"] as const;
export type FaceShape = (typeof FACE_SHAPES)[number];
export const isFaceShape = (v: unknown): v is FaceShape => typeof v === "string" && (FACE_SHAPES as readonly string[]).includes(v);

/** Who a look is aimed at. "any" looks show for everyone. */
export const AUDIENCES = ["men", "women", "any"] as const;
export type Audience = (typeof AUDIENCES)[number];
export const isAudience = (v: unknown): v is Audience => typeof v === "string" && (AUDIENCES as readonly string[]).includes(v);

/** The profile's "Show me" setting: which cuts to browse, not who the person is. */
export const LOOK_FOR = ["men", "women", "both"] as const;
export type LookFor = (typeof LOOK_FOR)[number];
export const isLookFor = (v: unknown): v is LookFor => typeof v === "string" && (LOOK_FOR as readonly string[]).includes(v);
export const LOOK_FOR_LABEL: Record<LookFor, string> = { men: "Men's cuts", women: "Women's cuts", both: "Both" };

/**
 * Controlled tags. Taste, "More like this", diversity and the face-shape guide only work as well as the tags, so
 * looks may use these and nothing else (scripts/build-looks.mjs and post validation enforce it).
 */
export const STYLE_TAGS = [
  "fringe",
  "side-fringe",
  "curtain-fringe",
  "volume-top",
  "taper",
  "fade",
  "buzz",
  "crop",
  "undercut",
  "quiff",
  "slick-back",
  "side-part",
  "center-part",
  "layers",
  "shag",
  "bob",
  "lob",
  "pixie",
  "chin-length",
  "long-layers",
  "blunt",
  "texture",
  "waves",
  "curls",
  "coils",
  "afro",
  "twists",
  "locs",
  "braids",
  "bun",
  "ponytail",
  "natural",
  "low-maintenance",
  "sleek",
] as const;
export type StyleTag = (typeof STYLE_TAGS)[number];
export const isStyleTag = (v: unknown): v is StyleTag => typeof v === "string" && (STYLE_TAGS as readonly string[]).includes(v);
export const tagLabel = (t: string) => t.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());

/**
 * Look IDs: curated looks use a plain slug; "m-<id>" are private cuts kept on one device and "p-<id>" are community
 * posts, neither of which is in the static catalog. Same shape as the try-on LOOK_ID rule.
 */
const LOOK_ID = /^[a-z0-9]+(?:-[a-z0-9]+){0,7}$/;
export type LookSource = "curated" | "mine" | "community";
export function lookSource(id: string): LookSource {
  return id.startsWith("p-") ? "community" : id.startsWith("m-") ? "mine" : "curated";
}
/** Whether a saved ID may be kept: a known curated look, or any well-formed private/community ID. */
export function isKeepableLookId(id: unknown, curated: ReadonlySet<string>): id is string {
  if (typeof id !== "string" || id.length > 64 || !LOOK_ID.test(id)) return false;
  return curated.has(id) || /^[pm]-/.test(id);
}
