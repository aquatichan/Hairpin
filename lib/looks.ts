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

type GalleryEntry = Omit<Look, "ratio" | "length" | "texture"> & { length: string; texture: string; width: number; height: number };

const photoLooks: Look[] = (gallery as GalleryEntry[]).map(({ width, height, ...entry }) => ({
  ...entry,
  length: entry.length as Look["length"],
  texture: entry.texture as Look["texture"],
  ratio: height / width,
}));

/** The hair library: real photos from content/gallery.json, added with scripts/import-photos.mjs. */
export const libraryLooks: Look[] = photoLooks;
