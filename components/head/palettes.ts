/**
 * Colour treatments for the 3D hero. Colours are linear RGB (what the shaders
 * work in). `accent` is the two-tone used for the splotches in the backdrop;
 * null keeps the backdrop to blacks and grays only.
 */
export type Palette = {
  hair: [number, number, number];
  highlight: [number, number, number];
  rimLight: string;
  accent: { dark: [number, number, number]; light: [number, number, number] } | null;
};

export const palettes = {
  /** Brown hair, muted oxblood splotches. */
  oxblood: {
    hair: [0.06, 0.024, 0.01],
    highlight: [0.55, 0.42, 0.32],
    rimLight: "#c9b8a6",
    accent: { dark: [0.09, 0.02, 0.022], light: [0.2, 0.045, 0.05] },
  },
  /** Blonde hair, champagne splotches. */
  champagne: {
    hair: [0.36, 0.22, 0.08],
    highlight: [1.0, 0.85, 0.62],
    rimLight: "#e3cfa6",
    accent: { dark: [0.2, 0.14, 0.07], light: [0.58, 0.4, 0.16] },
  },
  /** Dark brown hair, no colour at all: black, graphite and ivory only. */
  monochrome: {
    hair: [0.035, 0.018, 0.009],
    highlight: [0.6, 0.55, 0.5],
    rimLight: "#d8d4ce",
    accent: null,
  },
} satisfies Record<string, Palette>;

export type PaletteName = keyof typeof palettes;
