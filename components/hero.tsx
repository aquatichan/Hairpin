import { libraryLooks } from "@/lib/looks";
import { Marquee } from "./marquee";
import { SignIn } from "./sign-in";
import { RevealText } from "./ui/reveal-text";

export function Hero() {
  return (
    <main className="relative flex min-h-dvh flex-1 flex-col overflow-hidden bg-onyx">
      <header className="animate-fade p-6 lg:px-12 lg:pt-12">
        <p className="font-serif text-title">Hairpin</p>
      </header>

      <section aria-label="Haircuts in the library" className="flex flex-1 animate-fade flex-col justify-center gap-3 py-6 [mask-image:linear-gradient(to_right,transparent,black_12%,black_88%,transparent)]">
        <Marquee looks={libraryLooks} duration={90} />
        <Marquee looks={libraryLooks} offset={4} duration={70} reverse tone="champagne" />
        <Marquee looks={libraryLooks} offset={8} duration={110} />
      </section>

      <div className="flex max-w-xl flex-col items-start gap-6 p-6 lg:p-12">
        <h1 className="font-serif text-display text-balance">
          <RevealText text="Try any cut on you before you sit in the chair." delay={150} />
        </h1>
        <div className="animate-rise" style={{ animationDelay: "900ms" }}>
          <SignIn />
        </div>
      </div>
    </main>
  );
}
