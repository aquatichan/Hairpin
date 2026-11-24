import type { Metadata, Viewport } from "next";
import { Bodoni_Moda, Inter, JetBrains_Mono, Playfair_Display } from "next/font/google";
import { AuthProvider } from "@/components/auth-provider";
import { MotionLayer } from "@/components/fx/motion-layer";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
// Bodoni Moda is only for the HAIRPIN wordmark.
const bodoni = Bodoni_Moda({ variable: "--font-bodoni", subsets: ["latin"], weight: "400" });
// The same display serif as the landing page, so the app and the landing read as one product.
const playfair = Playfair_Display({ variable: "--font-playfair", subsets: ["latin"], weight: ["400", "500", "600"], style: ["normal", "italic"] });
// Counts, stats and small labels: a mono face keeps numbers crisp and gives the pixel details a voice.
const mono = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin"], weight: ["400", "500"] });

export const metadata: Metadata = {
  title: "Hairpin",
  description: "Try any cut on you before you sit in the chair.",
  appleWebApp: { capable: true, title: "Hairpin", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#0b0b0c",
  colorScheme: "dark",
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} ${playfair.variable} ${mono.variable} ${bodoni.variable} h-full antialiased`}>
      {/* Browser extensions such as Grammarly add attributes to <body> before React loads; ignore only that. */}
      <body className="flex min-h-full flex-col" suppressHydrationWarning>
        <MotionLayer />
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
