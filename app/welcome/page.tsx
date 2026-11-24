"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { LOOKS, TRANSFORMS } from "@/components/landing/assets";
import { Bloom } from "@/components/fx/bloom";
import { Dither } from "@/components/fx/dither";
import { Grainient } from "@/components/fx/grainient";
import { Button } from "@/components/ui/button";
import { ChoiceRow } from "@/components/ui/choice-row";
import { FaceScan } from "@/components/face/face-scan";
import { HairAnalysisPanel } from "@/components/hair/hair-analysis";
import { HairTypePicker } from "@/components/hair/hair-type-picker";
import { HAIR_TYPES, hairTypeImage, hairTypeLabel, textureOf, type HairType } from "@/lib/hair-types";
import { Logo } from "@/components/ui/logo";
import { saveProfile, useProfile, type Profile } from "@/lib/profile";
import { LOOK_FOR, LOOK_FOR_LABEL, type LookFor } from "@/lib/style";

const LENGTHS = ["short", "medium", "long"] as const;
const STEPS = 3;
const STEP_KEY = "hairpin.welcome-step";

/** A `next` value we will follow: a path on this site only, never another origin (rejects `//x`, `/\x`, `https://x`). */
function safeNext(next: string | null): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return "/discover";
  try {
    const url = new URL(next, window.location.origin);
    if (url.origin !== window.location.origin) return "/discover";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/discover";
  }
}

/** Completion time, read only from the finish handler. */
const completedAt = () => Date.now();

function readStep() {
  try {
    const n = Number(sessionStorage.getItem(STEP_KEY));
    return Number.isInteger(n) && n > 0 && n < STEPS ? n : 0;
  } catch {
    return 0;
  }
}

function writeStep(n: number | null) {
  try {
    if (n === null) sessionStorage.removeItem(STEP_KEY);
    else sessionStorage.setItem(STEP_KEY, String(n));
  } catch {}
}

const portraits = [LOOKS[1], LOOKS[3], LOOKS[7]].filter((l) => l.asset.ready);
const example = TRANSFORMS[0];

/** Step 1: three illustrative portraits fanned out. */
function Fan() {
  const tilt = ["-rotate-6 translate-y-4", "z-10 -translate-y-2", "rotate-6 translate-y-4"];
  return (
    <div className="flex w-full max-w-lg items-center justify-center py-4">
      {portraits.map((l, i) => (
        <div
          key={l.asset.id}
          className={`relative -mx-4 aspect-[3/4] w-[32%] max-w-44 overflow-hidden rounded-card border border-hairline bg-graphite shadow-2xl shadow-onyx ${tilt[i]}`}
        >
          <Image src={l.asset.path} alt="" fill sizes="(max-width: 1024px) 30vw, 176px" className="object-cover" priority={i === 1} />
        </div>
      ))}
    </div>
  );
}

/** Step 2: one illustrative before and after pair. */
function Pair() {
  const ready = example.before.ready && example.after.ready;
  if (!ready) return null;
  return (
    <div className="flex w-full max-w-lg items-center justify-center gap-3">
      {[
        { a: example.before, label: "Your photo" },
        { a: example.after, label: "Try-on preview" },
      ].map(({ a, label }, i) => (
        <figure key={a.id} className="flex w-[42%] max-w-56 flex-col gap-2">
          <div className={`relative aspect-[3/4] overflow-hidden rounded-card border bg-graphite ${i ? "border-champagne/60" : "border-hairline"}`}>
            <Image src={a.path} alt="" fill sizes="(max-width: 1024px) 40vw, 224px" className="object-cover" />
          </div>
          <figcaption className={`text-caption tracking-widest uppercase ${i ? "text-champagne" : "text-stone"}`}>{label}</figcaption>
        </figure>
      ))}
    </div>
  );
}

/** Step 3: the hair-type scale, with the chosen pattern large. */
function HairVisual({ type }: { type: HairType | null }) {
  return (
    <div className="flex w-full max-w-lg flex-col items-center gap-4">
      <div className="relative aspect-square w-[70%] max-w-80 overflow-hidden rounded-card border border-champagne/40 shadow-2xl shadow-onyx" key={type ?? "none"}>
        <Image src={hairTypeImage(type ?? "2b")} alt="" fill sizes="320px" className="pop-in object-cover" priority />
        <span className="absolute bottom-3 left-3 font-mono text-lead text-champagne">{type ? hairTypeLabel(type) : "1A to 4C"}</span>
      </div>
      <ul className="flex gap-1" aria-hidden>
        {HAIR_TYPES.map((t) => (
          <li key={t} className={`h-1.5 w-5 rounded-full transition-colors duration-300 ${t === type ? "bg-champagne" : t[0] === type?.[0] ? "bg-champagne/40" : "bg-hairline"}`} />
        ))}
      </ul>
    </div>
  );
}

function Welcome() {
  const router = useRouter();
  const next = useSearchParams().get("next");
  const profile = useProfile();
  const [step, setStep] = useState(0);
  const [length, setLength] = useState<Profile["length"]>(null);
  const [hairType, setHairType] = useState<HairType | null>(null);
  const [lookFor, setLookFor] = useState<LookFor | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const finishing = useRef(false);
  const moved = useRef(false);

  // Pick up where a reload left off.
  useEffect(() => {
    const saved = readStep();
    if (saved) queueMicrotask(() => setStep(saved));
  }, []);

  // Move focus to each new screen's heading so keyboard and screen-reader users follow along.
  useEffect(() => {
    writeStep(step);
    if (moved.current) heading.current?.focus();
  }, [step]);

  const go = (n: number) => {
    moved.current = true;
    setStep(n);
  };

  /** Marks onboarding done. Preferences are only written when chosen, so skipping never erases a saved profile. */
  function finish(withPreferences: boolean) {
    if (finishing.current) return;
    finishing.current = true;
    const patch: Partial<Profile> = { onboardedAt: completedAt() };
    if (withPreferences) {
      if (length) patch.length = length;
      if (lookFor) patch.lookFor = lookFor;
      if (hairType) {
        patch.hairType = hairType;
        patch.texture = textureOf(hairType);
      }
    }
    saveProfile(patch);
    writeStep(null);
    router.replace(safeNext(next));
  }

  const shownLength = length ?? profile?.length ?? null;
  const shownType = hairType ?? profile?.hairType ?? null;
  const shownLookFor = lookFor ?? profile?.lookFor ?? null;
  const toTry = Boolean(next?.startsWith("/try"));

  const screens = [
    {
      eyebrow: "Hairstyle discovery",
      title: (
        <>
          Discover your <em className="text-champagne">next</em> look.
        </>
      ),
      body: "Browse cuts for every length and texture, and keep the ones you love.",
      visual: <Fan />,
    },
    {
      eyebrow: "AI try-on",
      title: (
        <>
          See it on <em className="text-champagne">you</em>.
        </>
      ),
      body: "When you're ready, add a photo in Try and preview any cut on your own face. You don't need a photo to browse.",
      visual: <Pair />,
    },
    {
      eyebrow: "Optional",
      title: (
        <>
          Make it <em className="text-champagne">yours</em>.
        </>
      ),
      body: "Tell us what to show and your hair type so the right cuts come first. Pick your hair type, or let the AI read it from a photo. You can change all of it anytime in You.",
      visual: <HairVisual type={shownType} />,
    },
  ];
  const s = screens[step];
  const last = step === STEPS - 1;

  return (
    <main className="relative flex min-h-dvh flex-1 flex-col overflow-hidden bg-onyx">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <Grainient tone="gold" className="opacity-80" />
        <Dither className="opacity-[0.14]" cell={6} />
        <Bloom name="peony-tr" className="absolute -top-12 -right-24 w-[28rem] opacity-70 max-lg:opacity-40" rotate={-25} />
        <Bloom name="peony-bl" className="absolute -bottom-16 -left-20 w-80 opacity-50 max-lg:hidden" rotate={15} delay={2} />
      </div>

      <header className="relative flex items-center justify-between px-6 pt-[max(1.5rem,env(safe-area-inset-top))] lg:px-12 lg:pt-10">
        <Logo />
        {!last && (
          <button
            type="button"
            onClick={() => finish(false)}
            className="rounded-full px-3 py-2 text-body text-stone transition-colors hover:text-ivory focus-visible:outline-2 focus-visible:outline-champagne-light"
          >
            Skip
          </button>
        )}
      </header>

      <div className="relative mx-auto grid w-full max-w-6xl flex-1 grid-rows-[auto_1fr] gap-8 px-6 pt-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] lg:grid-cols-2 lg:grid-rows-1 lg:items-center lg:gap-16 lg:px-12 lg:pb-12">
        <div key={`v${step}`} className="flex min-h-0 w-full animate-fade items-center justify-center lg:order-2">
          {s.visual}
        </div>

        <section key={step} aria-labelledby="welcome-title" className="flex animate-fade flex-col justify-end gap-6 lg:justify-center">
          <div className="flex gap-2" aria-hidden>
            {screens.map((_, i) => (
              <span key={i} className={`h-0.5 flex-1 rounded-full transition-colors duration-300 ${i <= step ? "bg-champagne" : "bg-hairline"}`} />
            ))}
          </div>
          <div className="flex flex-col gap-3">
            <p className="text-caption tracking-widest text-champagne uppercase">
              <span className="sr-only">
                Step {step + 1} of {STEPS}:{" "}
              </span>
              {s.eyebrow}
            </p>
            <h1 id="welcome-title" ref={heading} tabIndex={-1} className="font-serif text-display text-balance outline-none">
              {s.title}
            </h1>
            <p className="max-w-md text-lead text-stone">{s.body}</p>
          </div>

          {step === 1 && (
            <p className="max-w-md border-l border-champagne/50 pl-4 text-caption text-stone">
              Your photo is kept on this device. When you try a cut, the photo you pick is sent to the AI provider to make the preview, and results can vary. The images
              here are illustrative AI portraits.{" "}
              <Link href="/privacy" className="underline underline-offset-4 hover:text-ivory">
                Privacy Policy
              </Link>
            </p>
          )}

          {last && (
            <div className="flex flex-col gap-5">
              <ChoiceRow label="Show me" options={LOOK_FOR} value={shownLookFor} onChange={setLookFor} render={(v) => LOOK_FOR_LABEL[v]} />
              <ChoiceRow label="Length" options={LENGTHS} value={shownLength} onChange={setLength} />
              <div className="flex flex-col gap-2">
                <p className="text-body text-stone">Hair type</p>
                <HairTypePicker value={shownType} onChange={setHairType} compact />
              </div>
              <details className="group">
                <summary className="cursor-pointer list-none text-body text-champagne underline-offset-4 hover:underline [&::-webkit-details-marker]:hidden">Not sure? Read it from a photo</summary>
                <div className="pt-3">
                  <HairAnalysisPanel
                    onApplied={(a) => {
                      setHairType(a.hairType);
                      setLength(a.length);
                    }}
                  />
                </div>
              </details>
              <details className="group">
                <summary className="cursor-pointer list-none text-body text-champagne underline-offset-4 hover:underline [&::-webkit-details-marker]:hidden">Find your face shape (optional)</summary>
                <div className="pt-3">
                  <FaceScan />
                </div>
              </details>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {step > 0 && (
              <Button variant="ghost" className={last ? "flex-1 sm:flex-none" : ""} onClick={() => go(step - 1)}>
                Back
              </Button>
            )}
            {last ? (
              <>
                <Button className="order-first basis-full sm:order-none sm:basis-0 sm:flex-1" onClick={() => finish(true)}>
                  {toTry ? "Continue to try-on" : "Explore styles"}
                </Button>
                <Button variant="ghost" className="flex-1 sm:flex-none" onClick={() => finish(false)}>
                  Skip
                </Button>
              </>
            ) : (
              <Button className="flex-1" onClick={() => go(step + 1)}>
                Continue
              </Button>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

export default function Page() {
  return (
    <Suspense>
      <Welcome />
    </Suspense>
  );
}
