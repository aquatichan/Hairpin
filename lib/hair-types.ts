/**
 * Hair types on the widely used 1A-4C scale. The number is the family (1 straight, 2 wavy, 3 curly, 4 coily), the
 * letter how fine or tight the pattern is. Dependency-free: shared by the client, the analysis route and tests.
 */
export const HAIR_TYPES = ["1a", "1b", "1c", "2a", "2b", "2c", "3a", "3b", "3c", "4a", "4b", "4c"] as const;
export type HairType = (typeof HAIR_TYPES)[number];
export type HairFamily = "1" | "2" | "3" | "4";
export type Texture = "straight" | "wavy" | "curly" | "coily";

export const isHairType = (v: unknown): v is HairType => typeof v === "string" && (HAIR_TYPES as readonly string[]).includes(v);

export const FAMILIES: { id: HairFamily; texture: Texture; label: string; blurb: string }[] = [
  { id: "1", texture: "straight", label: "Straight", blurb: "Falls flat from root to tip" },
  { id: "2", texture: "wavy", label: "Wavy", blurb: "Loose S-shaped bends" },
  { id: "3", texture: "curly", label: "Curly", blurb: "Springy loops and ringlets" },
  { id: "4", texture: "coily", label: "Coily", blurb: "Tight coils and zigzags" },
];

export const HAIR_TYPE_INFO: Record<HairType, { name: string; blurb: string }> = {
  "1a": { name: "Fine straight", blurb: "Very fine, silky and flat, with no bend." },
  "1b": { name: "Straight with body", blurb: "Straight, medium thickness, a little bend at the ends." },
  "1c": { name: "Coarse straight", blurb: "Straight but thick and coarse, with a slight bend." },
  "2a": { name: "Loose waves", blurb: "Fine, barely-there S-waves, flat at the root." },
  "2b": { name: "Defined waves", blurb: "Clear S-waves from the mid-lengths down." },
  "2c": { name: "Deep waves", blurb: "Thick waves from the root, close to loose curls." },
  "3a": { name: "Loose curls", blurb: "Big, shiny spirals about the width of sidewalk chalk." },
  "3b": { name: "Springy ringlets", blurb: "Bouncy curls about the width of a marker." },
  "3c": { name: "Tight corkscrews", blurb: "Dense curls about the width of a pencil." },
  "4a": { name: "Soft coils", blurb: "Tight, defined S-coils, springy and dense." },
  "4b": { name: "Zigzag coils", blurb: "Sharp Z-shaped coils, fluffy and less defined." },
  "4c": { name: "Tight zigzag", blurb: "Very tight, densely packed coils with high shrinkage." },
};

export const familyOf = (t: HairType): HairFamily => t[0] as HairFamily;
export const textureOf = (t: HairType): Texture => FAMILIES.find((f) => f.id === familyOf(t))!.texture;
export const typesIn = (f: HairFamily) => HAIR_TYPES.filter((t) => t[0] === f);
export const hairTypeLabel = (t: HairType) => t.toUpperCase();
export const hairTypeImage = (t: HairType) => `/assets/hair-types/hair-${t}.webp`;

/** How close two hair types are: same type 3, same family 2, neighbouring family 1, else 0. */
export function hairTypeAffinity(a: HairType | null | undefined, b: HairType | null | undefined): number {
  if (!a || !b) return 0;
  if (a === b) return 3;
  const d = Math.abs(Number(a[0]) - Number(b[0]));
  return d === 0 ? 2 : d === 1 ? 1 : 0;
}
