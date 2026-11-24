import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { libraryLooks, type Look } from "./looks";
import { postToLook } from "./posts-look";
import { isPostId, publicView } from "./posts-model";
import { devImage, posts, postsAvailable } from "./posts.server";
import { isLookId, type LookFacts } from "./tryon-plan";

/** Reference portraits may only come from these public catalog folders. */
const ALLOWED_DIRS = ["/assets/gallery/", "/assets/transformations/", "/assets/looks/"];
const TYPES: Record<string, string> = { ".webp": "image/webp", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png" };
const PUBLIC_ROOT = path.join(process.cwd(), "public");

/** A curated look, or an approved community post. Private cuts (m-) are never resolved here: they travel as uploads. */
export async function findLook(id: unknown): Promise<Look | null> {
  if (!isLookId(id)) return null;
  const curated = libraryLooks.find((l) => l.id === id);
  if (curated) return curated;
  if (!isPostId(id) || !postsAvailable()) return null;
  try {
    const post = await posts().load(id);
    return post && post.status === "approved" ? postToLook(publicView(post, null)) : null;
  } catch {
    return null;
  }
}

export const lookFacts = (l: Look): LookFacts => ({ id: l.id, name: l.name, length: l.length, texture: l.texture, notes: l.notes });

/**
 * Reads a look's reference portrait from the app's own files. The path comes from the curated catalog (lib/looks.ts), never
 * from the request, and is checked to stay inside the allowed folders before anything is read.
 */
export async function referenceImage(look: Look): Promise<Blob> {
  if (look.source === "community") return communityImage(look);
  const rel = look.image;
  const ext = path.extname(rel).toLowerCase();
  if (!ALLOWED_DIRS.some((d) => rel.startsWith(d)) || rel.includes("..") || !TYPES[ext]) {
    throw new Error("Catalog image path is outside the allowed folders.");
  }
  const file = path.resolve(PUBLIC_ROOT, `.${rel}`);
  if (!file.startsWith(PUBLIC_ROOT + path.sep)) throw new Error("Catalog image path escapes public/.");
  const bytes = await readFile(file);
  return new Blob([new Uint8Array(bytes)], { type: TYPES[ext] });
}

/**
 * A community post's image, fetched from the URL our own server stored when it was uploaded (never from the request).
 * Only Vercel Blob hosts (or the development route) are followed, and the size is capped.
 */
async function communityImage(look: Look): Promise<Blob> {
  const name = look.image.startsWith("/api/posts/img/") ? look.image.slice("/api/posts/img/".length) : null;
  if (name) {
    const img = devImage(name);
    if (!img) throw new Error("Community image missing.");
    return new Blob([new Uint8Array(img.bytes)], { type: img.type });
  }
  const url = new URL(look.image);
  if (url.protocol !== "https:" || !url.hostname.endsWith(".public.blob.vercel-storage.com")) throw new Error("Community image host not allowed.");
  const res = await fetch(url, { cache: "force-cache", signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error("Community image unavailable.");
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.byteLength === 0 || bytes.byteLength > 1_000_000) throw new Error("Community image size not allowed.");
  return new Blob([bytes], { type: "image/webp" });
}
