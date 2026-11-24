import { textureOf, isHairType } from "./hair-types";
import type { Look } from "./looks";
import type { PublicPost } from "./posts-model";

/** A community post as a `Look`, so Discover, Saved and Try treat it like any other cut. Shared by client and server. */
export function postToLook(p: PublicPost): Look {
  const hairType = isHairType(p.hairType) ? p.hairType : undefined;
  return {
    id: p.id,
    name: p.name,
    notes: p.description,
    image: p.image,
    ratio: p.height / p.width,
    alt: p.name,
    length: p.length,
    texture: hairType ? textureOf(hairType) : "straight",
    hairType,
    audience: p.audience,
    tags: p.tags as Look["tags"],
    // Face-shape matches come only from curated looks; uploaders can't set them.
    faceShapes: [],
    source: "community",
    createdAt: p.createdAt,
    saves: p.saves,
    owner: p.ownerKey,
  };
}
