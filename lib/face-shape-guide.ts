/**
 * What stylists often recommend for each face shape. Data only, positive wording, no "avoid" lists: face shape is a
 * styling convention, not a rule, and every card says so. Type-only import so tests can load it.
 */
import type { FaceShape, StyleTag } from "./style";

export type FaceShapeGuide = {
  name: string;
  /** One line describing the shape. */
  shape: string;
  /** Often recommended, in plain words. */
  ideas: string[];
  /** Matching tags (lib/style.ts) that the feed leans towards. */
  tags: StyleTag[];
  versatile?: boolean;
};

export const FACE_SHAPE_GUIDE: Readonly<Record<FaceShape, FaceShapeGuide>> = Object.freeze({
  oval: {
    name: "Oval",
    shape: "Longer than wide, with a forehead slightly wider than a gently rounded jaw.",
    ideas: ["Most lengths and partings work", "A good shape for trying something bold", "Fringes, crops and long layers all sit well"],
    tags: ["fringe", "crop", "long-layers", "bob", "quiff", "texture"],
    versatile: true,
  },
  round: {
    name: "Round",
    shape: "About as wide as long, with full cheeks and a soft jaw.",
    ideas: ["Height on top", "Tapered or tighter sides", "A side part or longer layers past the chin"],
    tags: ["volume-top", "quiff", "taper", "fade", "side-part", "long-layers", "lob"],
  },
  square: {
    name: "Square",
    shape: "Forehead, cheekbones and jaw about the same width, with a strong jaw.",
    ideas: ["Soft texture and movement", "Side-swept or curtain fringes", "Layers that frame the face"],
    tags: ["texture", "side-fringe", "curtain-fringe", "layers", "waves", "side-part"],
  },
  heart: {
    name: "Heart",
    shape: "Wider at the forehead, narrowing to a pointed chin.",
    ideas: ["Fullness around the chin and jaw", "Side or curtain fringes", "Chin-length to shoulder-length cuts"],
    tags: ["side-fringe", "curtain-fringe", "chin-length", "lob", "bob", "waves"],
  },
  oblong: {
    name: "Oblong",
    shape: "Noticeably longer than wide, with straight sides.",
    ideas: ["A fringe to shorten the face", "Width at the sides", "Waves or curls through the mid-lengths"],
    tags: ["fringe", "curtain-fringe", "waves", "curls", "shag", "bob", "crop"],
  },
  diamond: {
    name: "Diamond",
    shape: "Widest at the cheekbones, with a narrower forehead and jaw.",
    ideas: ["Fullness at the forehead and chin", "Soft fringes", "Texture that balances the cheekbones"],
    tags: ["fringe", "side-fringe", "texture", "shag", "chin-length", "layers"],
  },
});

export const FACE_SHAPE_DISCLAIMER = "A starting point, not a rule.";
export const faceTags = (shape: FaceShape | null): StyleTag[] => (shape ? FACE_SHAPE_GUIDE[shape].tags : []);
