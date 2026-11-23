import { Playfair_Display } from "next/font/google";

/** Display serif shared by the landing page and the legal pages. */
export const display = Playfair_Display({
  variable: "--font-hp-display",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
});
