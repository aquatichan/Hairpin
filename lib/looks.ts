import gallery from "@/content/gallery.json";
import generated from "@/content/looks.generated.json";
import { isHairType, type HairType } from "./hair-types";
import { isAudience, isFaceShape, isStyleTag, type Audience, type FaceShape, type LookSource, type StyleTag } from "./style";

export type Look = {
  id: string;
  name: string;
  length: "short" | "medium" | "long";
  texture: "straight" | "wavy" | "curly" | "coily";
  /** The hair type the portrait shows, 1A-4C (lib/hair-types.ts). */
  hairType?: HairType;
  notes: string;
  image: string;
  /** Optional short muted loop; `image` is its poster frame. */
  video?: string;
  /** Height divided by width, so tiles reserve their space before the image loads. */
  ratio: number;
  /** Describes the photo for screen readers; falls back to the look name. */
  alt?: string;
  /**
   * A genuinely matched "before" photo of the same person, when one exists. Only then does
   * the look sheet offer a before/after comparison. Never synthesize a pair.
   */
  before?: string;
  /** True for AI-generated or stand-in portraits, which the UI labels as illustrative. */
  illustrative?: boolean;
  /** Photographer credit, shown on the look sheet. */
  credit?: string;
  creditUrl?: string;
  /** Who the cut is aimed at; "any" shows for everyone. */
  audience: Audience;
  /** Controlled tags (lib/style.ts STYLE_TAGS). */
  tags: StyleTag[];
  /** Face shapes this cut is often recommended for, set by a curator (never inferred for community posts). */
  faceShapes: FaceShape[];
  source: LookSource;
  /** ms epoch; drives "New" and recency. */
  createdAt: number;
  /** Tiny data-URL placeholder shown while the image loads. */
  blur?: string;
  /** Community: save count, for popularity. */
  saves?: number;
  /** Community: a one-way key for the uploader, so the feed doesn't stack one person's cuts. */
  owner?: string;
};

type RawEntry = {
  id: string;
  name: string;
  notes: string;
  image: string;
  length: string;
  texture: string;
  hairType?: string;
  width: number;
  height: number;
  audience?: string;
  tags?: string[];
  faceShapes?: string[];
  createdAt?: number;
  blur?: string;
  alt?: string;
  before?: string;
  video?: string;
  illustrative?: boolean;
  credit?: string;
  creditUrl?: string;
};

/** The launch catalog's date: curated looks don't compete on recency. */
const CURATED_AT = Date.UTC(2026, 10, 1);

function toLook({ width, height, ...e }: RawEntry): Look {
  return {
    ...e,
    length: e.length as Look["length"],
    texture: e.texture as Look["texture"],
    hairType: isHairType(e.hairType) ? e.hairType : undefined,
    ratio: height / width,
    audience: isAudience(e.audience) ? e.audience : "any",
    tags: (e.tags ?? []).filter(isStyleTag),
    faceShapes: (e.faceShapes ?? []).filter(isFaceShape),
    source: "curated",
    createdAt: e.createdAt ?? CURATED_AT,
  };
}

/**
 * The curated catalog: the illustrative portraits in content/gallery.json (shared with the landing page) plus the
 * looks built by scripts/build-looks.mjs from content/curated-looks.json. Private and community cuts are added at
 * runtime (lib/cuts.ts, lib/posts).
 */
export const libraryLooks: Look[] = [...(gallery as RawEntry[]), ...(generated as RawEntry[])].map(toLook);

export const curatedIds: ReadonlySet<string> = new Set(libraryLooks.map((l) => l.id));
