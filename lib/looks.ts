import { hairStyles } from "@/components/head/styles";
import gallery from "@/content/gallery.json";

export type Look = {
  id: string;
  name: string;
  length: "short" | "medium" | "long";
  texture: "straight" | "wavy" | "curly" | "coily";
  notes: string;
  image: string;
  /** Height divided by width, so tiles reserve their space before the image loads. */
  ratio: number;
  /** Photographer credit, shown on the look sheet. */
  credit?: string;
  creditUrl?: string;
};

const RATIOS = [1.25, 1.5, 1];

/**
 * Preview catalog: stills of the in-app mannequin (see scripts/render-looks.cjs).
 * Replaced by the Publik-generated catalog in Firestore once keys are in place.
 */
const mannequinLooks: Look[] = [0, 1].flatMap((view) =>
  // The second pass is offset so the two views of a style never sit side by side.
  hairStyles.map((_, n) => (n * (view ? 7 : 5) + view * 3) % hairStyles.length).map((i) => [hairStyles[i], i] as const).map(([style, i]) => ({
    id: `${style.id}-${view}`,
    name: style.name,
    length: style.length,
    texture: style.texture,
    notes: style.notes,
    image: `/looks/${style.id}-${view}.jpg`,
    ratio: RATIOS[(i + view * 2) % RATIOS.length],
  })),
);

type GalleryEntry = Omit<Look, "ratio" | "length" | "texture"> & { length: string; texture: string; width: number; height: number };

const photoLooks: Look[] = (gallery as GalleryEntry[]).map(({ width, height, ...entry }) => ({
  ...entry,
  length: entry.length as Look["length"],
  texture: entry.texture as Look["texture"],
  ratio: height / width,
}));

/**
 * The hair library. Real photos from content/gallery.json (added with
 * scripts/import-photos.mjs) take over as soon as there are any; until then
 * the library shows stills of the 3D head.
 */
export const libraryLooks: Look[] = photoLooks.length > 0 ? photoLooks : mannequinLooks;
export const libraryIsPhotos = photoLooks.length > 0;
