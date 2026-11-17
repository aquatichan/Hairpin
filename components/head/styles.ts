/**
 * Hairstyles for the 3D head, described as grooming parameters rather than
 * meshes. Every strand is grown in the vertex shader from these numbers, so
 * moving between two styles is a smooth blend: hair lengthens, falls, curls.
 * Lengths are in model units (the skull is about 2 units in radius).
 */
export type Groom = {
  /** Strand length on the crown, sides and nape, plus extra at the front. */
  top: number;
  side: number;
  back: number;
  front: number;
  /** 0..1: keep length only along the midline (mohawk). */
  mid: number;
  /** How strongly strands leave along the scalp normal (1 = stands up). */
  stiff: number;
  gravity: number;
  /** Combing direction and strength. With `part`, x flips either side of a middle part. */
  sweep: [number, number, number];
  part: number;
  /** Helix radius and turns per unit length. */
  curl: number;
  curlF: number;
  frizz: number;
  /** How far strands float off the scalp, for volume. */
  volume: number;
};

export type HairStyle = {
  id: string;
  name: string;
  length: "short" | "medium" | "long";
  texture: "straight" | "wavy" | "curly" | "coily";
  /** One line a barber would recognise. General guidance, not a prescription. */
  notes: string;
  groom: Groom;
};

const g = (p: Partial<Groom>): Groom => ({
  top: 1, side: 0.3, back: 0.3, front: 0, mid: 0, stiff: 0.6, gravity: 0.4, sweep: [0, 0, 0], part: 0, curl: 0, curlF: 0, frizz: 0.2, volume: 0.1, ...p,
});

export const hairStyles: HairStyle[] = [
  { id: "buzz", notes: "Clipped short and even all over. The lowest-upkeep cut there is.", name: "Buzz cut", length: "short", texture: "straight", groom: g({ top: 0.1, side: 0.075, back: 0.075, stiff: 1, gravity: 0, frizz: 0.5, volume: 0.01 }) },
  { id: "quiff", notes: "Short sides, length left on top and pushed up and back at the front.", name: "Textured quiff", length: "short", texture: "wavy", groom: g({ top: 0.75, side: 0.2, back: 0.22, front: 0.95, stiff: 0.55, gravity: 0.2, sweep: [0, 0.8, -0.9], frizz: 0.45, curl: 0.03, curlF: 4, volume: 0.1 }) },
  { id: "curtains", notes: "Middle part with the fringe falling to either side of the face.", name: "Curtain fringe", length: "medium", texture: "straight", groom: g({ top: 2.3, side: 0.9, back: 1.0, front: 0.5, stiff: 0.3, gravity: 0.9, sweep: [0.9, 0.25, 0.25], part: 1, frizz: 0.15, curl: 0.04, curlF: 1.6, volume: 0.16 }) },
  { id: "afro", notes: "Shaped into an even, rounded silhouette that follows the head.", name: "Rounded afro", length: "medium", texture: "coily", groom: g({ top: 1.5, side: 1.45, back: 1.45, stiff: 1, gravity: 0, curl: 0.1, curlF: 6.5, frizz: 0.9, volume: 0.05 }) },
  { id: "mohawk", notes: "Sides taken right down, with a strip of length through the centre.", name: "Mohawk", length: "short", texture: "straight", groom: g({ top: 1.9, side: 0.1, back: 1.2, front: 0.2, mid: 1, stiff: 1, gravity: 0, sweep: [0, 0.6, -0.15], frizz: 0.25, volume: 0.02 }) },
  { id: "long", notes: "Past the shoulders, with layers cut in for movement.", name: "Long layers", length: "long", texture: "straight", groom: g({ top: 6.2, side: 5.2, back: 5.4, stiff: 0.16, gravity: 1.3, sweep: [0.8, 0, -0.5], part: 1, curl: 0.05, curlF: 1.1, frizz: 0.08, volume: 0.22 }) },
  { id: "slick", notes: "Medium length on top, combed straight back off the face.", name: "Slick back", length: "medium", texture: "straight", groom: g({ top: 2.0, side: 0.5, back: 0.7, stiff: 0.3, gravity: 0.35, sweep: [0, 0.15, -1.3], frizz: 0.06, volume: 0.06 }) },
  { id: "curls", notes: "Mid-length curls cut to sit in their natural pattern.", name: "Loose curls", length: "medium", texture: "curly", groom: g({ top: 1.7, side: 1.2, back: 1.4, stiff: 0.45, gravity: 0.7, sweep: [0.4, 0, 0], part: 1, curl: 0.2, curlF: 5.2, frizz: 0.4, volume: 0.16 }) },
  { id: "bob", notes: "One length, cut to a clean line around the jaw.", name: "Blunt bob", length: "medium", texture: "straight", groom: g({ top: 3.5, side: 2.2, back: 1.9, stiff: 0.14, gravity: 1.5, sweep: [0.8, 0, -0.3], part: 1, frizz: 0.04, volume: 0.2 }) },
  { id: "sidepart", notes: "A classic taper with the top combed across from a defined part.", name: "Side part", length: "short", texture: "straight", groom: g({ top: 1.5, side: 0.35, back: 0.35, front: 0.3, stiff: 0.4, gravity: 0.55, sweep: [1.1, 0.2, -0.25], frizz: 0.12, volume: 0.1 }) },
  { id: "shag", notes: "Choppy layers throughout, worn loose and a little undone.", name: "Wavy shag", length: "long", texture: "wavy", groom: g({ top: 3.4, side: 3.0, back: 3.6, front: 0.4, stiff: 0.25, gravity: 1.1, sweep: [0.6, 0, 0.1], part: 1, curl: 0.13, curlF: 2.6, frizz: 0.35, volume: 0.24 }) },
  { id: "coils", notes: "Short, defined coils kept close to the head.", name: "Tight coils", length: "short", texture: "coily", groom: g({ top: 0.6, side: 0.4, back: 0.4, stiff: 1, gravity: 0, curl: 0.07, curlF: 16, frizz: 0.8, volume: 0.03 }) },
];

const KEYS = ["top", "side", "back", "front", "mid", "stiff", "gravity", "part", "curl", "curlF", "frizz", "volume"] as const;

/** Writes the blend of two grooms into flat uniform arrays. */
export function blendGroom(a: Groom, b: Groom, t: number, out: Float32Array, sweep: { set(x: number, y: number, z: number): unknown }) {
  KEYS.forEach((k, i) => {
    out[i] = a[k] + (b[k] - a[k]) * t;
  });
  sweep.set(a.sweep[0] + (b.sweep[0] - a.sweep[0]) * t, a.sweep[1] + (b.sweep[1] - a.sweep[1]) * t, a.sweep[2] + (b.sweep[2] - a.sweep[2]) * t);
}

export const GROOM_SIZE = KEYS.length;
