import { HeroCanvas } from "@/components/head/hero-canvas";
import { SignIn } from "@/components/sign-in";

export default function Landing() {
  return (
    <main className="relative flex min-h-dvh flex-1 flex-col overflow-hidden bg-onyx">
      <HeroCanvas framing="hero" />
      <div className="absolute inset-x-0 bottom-0 h-1/2 bg-linear-to-t from-onyx to-transparent lg:hidden" aria-hidden />
      <div className="pointer-events-none relative flex flex-1 flex-col justify-between p-6 lg:p-12">
        <p className="font-serif text-title">Hairpin</p>
        <div className="pointer-events-auto flex max-w-xl flex-col items-start gap-6">
          <h1 className="font-serif text-display text-balance">Try any cut on you before you sit in the chair.</h1>
          <SignIn />
        </div>
      </div>
    </main>
  );
}
