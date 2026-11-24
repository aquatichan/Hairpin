import "server-only";
import { createHmac, randomBytes } from "node:crypto";
import { del, put } from "@vercel/blob";
import sharp from "sharp";
import { real } from "./env";
import { memoryKv, redisKv, type Kv } from "./kv";
import { HAIR_TYPES } from "./hair-types";
import { POST_LIMITS, newPostId, sensibleShape, type Vocab } from "./posts-model";
import { memoryPostStore, postRepo, redisPostStore, type BlobAdapter, type NewImage, type PostRepo } from "./posts-repo";
import { redis, redisConfigured } from "./redis.server";
import { AUDIENCES, STYLE_TAGS } from "./style";
import { sniffImage } from "./tryon-plan";

/**
 * Community posts, wired up: images in Vercel Blob (public, one re-encoded copy each), records in Upstash Redis.
 * Env: BLOB_READ_WRITE_TOKEN (server only), HAIRPIN_ADMIN_UIDS (comma-separated Firebase uids allowed to review).
 * Development without them keeps everything in this process's memory and serves images from /api/posts/img/<id>.
 * Production without both is "sharing unavailable": private cuts keep working, nothing is uploaded.
 */
const blobToken = real(process.env.BLOB_READ_WRITE_TOKEN);
export const blobConfigured = blobToken !== undefined;
export const postsAvailable = () => (blobConfigured && redisConfigured) || process.env.NODE_ENV !== "production";

export const VOCAB: Vocab = { audiences: AUDIENCES, lengths: ["short", "medium", "long"], hairTypes: HAIR_TYPES, tags: STYLE_TAGS };

/** Admins by uid. Anyone not listed gets 403 from every admin route. */
export const isAdmin = (uid: string | null) => uid !== null && (real(process.env.HAIRPIN_ADMIN_UIDS)?.split(",").map((s) => s.trim()).filter(Boolean) ?? []).includes(uid);

/** A short one-way key for a person, so the feed can avoid showing one uploader's cuts back to back. Never reversible. */
export function ownerKey(uid: string): string {
  const salt = real(process.env.HAIRPIN_IP_SALT) ?? real(process.env.PUBLIK_INSTALL_SECRET) ?? "development-only-salt";
  return createHmac("sha256", salt).update(`owner:${uid}`).digest("hex").slice(0, 10);
}

// ---- development fallbacks: kept on globalThis so hot reloads don't lose them ----------------------------------------
const g = globalThis as unknown as { __hairpinPosts?: { store: ReturnType<typeof memoryPostStore>; kv: Kv; images: Map<string, { bytes: Uint8Array; type: string }> } };
const dev = (g.__hairpinPosts ??= { store: memoryPostStore(), kv: memoryKv(), images: new Map() });

/** Where development images are served from (app/api/posts/img/[name]). */
export const devImage = (name: string) => dev.images.get(name) ?? null;

const blobAdapter: BlobAdapter = blobConfigured
  ? {
      put: async (path, bytes, contentType) => {
        const res = await put(path, Buffer.from(bytes), { access: "public", addRandomSuffix: true, contentType, cacheControlMaxAge: 365 * 24 * 3600, token: blobToken });
        return { url: res.url };
      },
      del: async (url) => void (await del(url, { token: blobToken })),
    }
  : {
      put: async (path, bytes, contentType) => {
        const name = path.replace(/^posts\//, "");
        dev.images.set(name, { bytes, type: contentType });
        return { url: `/api/posts/img/${name}` };
      },
      del: async (url) => void dev.images.delete(url.replace("/api/posts/img/", "")),
    };

let repo: PostRepo | null = null;
export function posts(): PostRepo {
  repo ??= redisConfigured ? postRepo(redisPostStore(redis), blobAdapter, redisKv(redis)) : postRepo(dev.store, blobAdapter, dev.kv);
  return repo;
}

export const newId = () => newPostId(randomBytes(6).toString("hex"));

/**
 * Re-encodes an uploaded image on the server whatever the browser did: orientation applied, at most 960 px on the long
 * side, WebP, all metadata dropped, and small enough to store. A client that skipped its own pipeline can't upload
 * an original (or a file that merely claims to be an image).
 */
export async function reencode(file: Blob): Promise<{ ok: true; image: NewImage } | { ok: false; message: string }> {
  if (file.size === 0 || file.size > 8_000_000) return { ok: false, message: "That photo is too large. Use a smaller one." };
  const input = new Uint8Array(await file.arrayBuffer());
  if (!sniffImage(input.slice(0, 16))) return { ok: false, message: "Use a JPEG, PNG or WebP photo." };
  try {
    for (const quality of [80, 70, 60, 50]) {
      const { data, info } = await sharp(input, { limitInputPixels: 40_000_000, failOn: "error" })
        .rotate()
        .resize({ width: 960, height: 960, fit: "inside", withoutEnlargement: true })
        .webp({ quality, effort: 4 })
        .toBuffer({ resolveWithObject: true });
      if (!sensibleShape(info.width, info.height)) return { ok: false, message: "That photo's shape doesn't work for a cut. Use a portrait or square photo." };
      if (data.byteLength <= POST_LIMITS.imageBytes) return { ok: true, image: { bytes: new Uint8Array(data), width: info.width, height: info.height, contentType: "image/webp" } };
    }
    return { ok: false, message: "That photo is too detailed to store. Try a simpler one." };
  } catch {
    return { ok: false, message: "That file couldn't be read as a photo." };
  }
}
