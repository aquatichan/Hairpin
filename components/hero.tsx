import { libraryLooks } from "@/lib/looks";
import { HeroVideo } from "./hero-video";
import { TiltedMarquee } from "./marquee";
import { SignIn } from "./sign-in";
import { Logo } from "./ui/logo";
import { RevealText } from "./ui/reveal-text";

export function Hero() {
  return (
    <main className="relative flex min-h-dvh flex-1 flex-col overflow-hidden bg-onyx">
      <HeroVideo />
      <section aria-label="Haircuts in the library" className="absolute inset-0 animate-fade lg:left-1/3" style={{ animationDuration: "1.6s" }}>
        <TiltedMarquee looks={libraryLooks} />
      </section>
      <div className="pointer-events-none absolute inset-0 bg-linear-to-t/oklch from-onyx via-onyx/60 to-transparent lg:bg-linear-to-r/oklch lg:via-onyx/40" aria-hidden />

      <header className="relative animate-fade p-6 lg:px-12 lg:pt-12">
        <Logo />
      </header>
      <div className="pointer-events-none relative mt-auto flex max-w-xl flex-col items-start gap-6 p-6 lg:my-auto lg:p-12">
        <p className="animate-fade text-caption tracking-widest text-champagne uppercase">Your next cut, first</p>
        <h1 className="font-serif text-display text-balance">
          <RevealText text="Try any cut on you before you sit in the chair." delay={150} />
        </h1>
        <div className="pointer-events-auto animate-rise" style={{ animationDelay: "900ms" }}>
          <SignIn />
        </div>
      </div>
    </main>
  );
}
