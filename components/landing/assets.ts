import manifest from "@/design/asset-manifest.json";

/**
 * Landing-page asset registry, derived from design/asset-manifest.json.
 *
 * Integrating an image never needs a component change:
 *   node scripts/integrate-asset.mjs <asset-id> <source-file>
 * crops/exports the file to `file`, verifies it, and sets status "integrated",
 * after which every slot using that ID renders the image instead of the placeholder.
 * Focal points are edited in the manifest (object_position / object_position_mobile).
 */
export type Hair = "curly" | "short" | "long" | "coily" | "wavy" | "straight" | "bun" | "crop";

type ManifestEntry = (typeof manifest.assets)[number];

export type LandingAsset = {
  id: string;
  path: string;
  ready: boolean;
  alt: string;
  /** CSS object-position at >= 768px. */
  focal: string;
  /** CSS object-position below 768px. */
  focalMobile: string;
  fit: "cover" | "contain";
  /** Silhouette used by the placeholder. */
  hair?: Hair;
};

const byId = new Map<string, ManifestEntry>(manifest.assets.map((e) => [e.id, e]));

function a(id: string, alt = "", hair?: Hair): LandingAsset {
  const e = byId.get(id);
  if (!e) throw new Error(`Asset "${id}" is missing from design/asset-manifest.json`);
  return {
    id,
    path: e.file,
    ready: e.status === "integrated",
    alt,
    focal: e.object_position,
    focalMobile: e.object_position_mobile,
    fit: e.fit === "contain" ? "contain" : "cover",
    hair,
  };
}

export const ASSETS = {
  heroPortrait: a("hero-portrait-01", "Editorial portrait of a man with voluminous textured dark hair", "curly"),
  heroPortraitAlt: a("hero-portrait-female-01", "Editorial portrait of a woman with long glossy waves", "long"),
  peonyTL: a("botanical-peony-tl"),
  peonyTR: a("botanical-peony-tr"),
  peonyBL: a("botanical-peony-bl"),
  peonyBR: a("botanical-peony-br"),
  petals: a("botanical-floating-petals-01"),
  featureDiscover: a("feature-discover", "", "wavy"),
  featureTryon: a("feature-tryon", "", "curly"),
  featureBrief: a("feature-barber-brief", "", "crop"),
  featureBoards: a("feature-saved-boards", "", "bun"),
  editorialWide: a("editorial-wide-01", "Wide editorial campaign of several people with different hairstyles"),
  grain: a("texture-dark-grain-01"),
} satisfies Record<string, LandingAsset>;

/** The 12 discovery references. Names describe the cut only; they are not users. */
export const LOOKS: { asset: LandingAsset; name: string; length: string; texture: string }[] = [
  ["Tousled waves", "Medium", "Wavy", "wavy"],
  ["Sleek bob", "Medium", "Straight", "straight"],
  ["Messy textured top", "Short", "Wavy", "curly"],
  ["Defined coils", "Short", "Coily", "coily"],
  ["Messy crop", "Short", "Straight", "crop"],
  ["Natural afro", "Medium", "Coily", "coily"],
  ["Textured quiff", "Short", "Wavy", "short"],
  ["Curtain fringe", "Medium", "Wavy", "wavy"],
  ["Curly top", "Short", "Curly", "curly"],
  ["Soft curtains", "Medium", "Wavy", "wavy"],
  ["Tousled fringe", "Short", "Wavy", "short"],
  ["Tousled bob", "Medium", "Wavy", "straight"],
].map(([name, length, texture, hair], i) => ({
  asset: a(`gallery-portrait-${String(i + 1).padStart(2, "0")}`, `Editorial reference: ${name.toLowerCase()}`, hair as Hair),
  name,
  length,
  texture,
}));

/** Ten matched before / try-on preview pairs, one per portrait in the picker. Illustrative only. */
export const TRANSFORMS = (
  [
    ["Defined twists", "coily", "coily"],
    ["Polished waves", "long", "long"],
    ["Sleek low bun", "long", "bun"],
    ["Long layers", "long", "long"],
    ["Natural afro", "coily", "coily"],
    ["Tousled bob", "straight", "wavy"],
    ["Messy textured top", "short", "curly"],
    ["Tousled fringe", "short", "wavy"],
    ["Messy crop", "short", "crop"],
    ["Curly top", "short", "curly"],
  ] as const
).map(([label, beforeHair, afterHair], i) => {
  const n = String(i + 1).padStart(2, "0");
  return {
    label,
    before: a(`transform-${n}-before`, `Demonstration portrait ${i + 1} before try-on`, beforeHair),
    after: a(`transform-${n}-after`, `Illustrative try-on preview: ${label.toLowerCase()}`, afterHair),
  };
});

/** Look up any manifest asset by ID (used by decorative botanicals). */
export const assetById = (id: string) => a(id);
