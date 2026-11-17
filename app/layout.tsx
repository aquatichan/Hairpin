import type { Metadata, Viewport } from "next";
import { Bodoni_Moda, Instrument_Serif, Inter } from "next/font/google";
import { AuthProvider } from "@/components/auth-provider";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
// Bodoni Moda is only for the HAIRPIN wordmark.
const bodoni = Bodoni_Moda({ variable: "--font-bodoni", subsets: ["latin"], weight: "400" });
const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: "400",
});

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
    <html lang="en" className={`${inter.variable} ${instrumentSerif.variable} ${bodoni.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
