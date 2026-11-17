"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Marquee } from "@/components/marquee";
import { Button } from "@/components/ui/button";
import { ChoiceRow } from "@/components/ui/choice-row";
import { RevealText } from "@/components/ui/reveal-text";
import { libraryLooks } from "@/lib/looks";
import { saveProfile, useProfile, type Profile } from "@/lib/profile";

const LENGTHS = ["short", "medium", "long"] as const;
const TEXTURES = ["straight", "wavy", "curly", "coily"] as const;

const steps = [
  { title: "Save one photo.", body: "It stays private, on your device, and you can delete it anytime." },
  { title: "Try any cut on it.", body: "Pick from the library or upload a screenshot of a cut you've seen." },
  { title: "Show your barber.", body: "Turn the one you like into a Barber Brief: clear instructions, no guesswork." },
];

function Welcome() {
  const router = useRouter();
  const next = useSearchParams().get("next");
  const profile = useProfile();
  const [step, setStep] = useState(0);
  const [length, setLength] = useState<Profile["length"]>(null);
  const [texture, setTexture] = useState<Profile["texture"]>(null);
  const last = step === steps.length;

  function finish() {
    saveProfile({ onboardedAt: Date.now(), length: length ?? profile?.length ?? null, texture: texture ?? profile?.texture ?? null });
    // Only same-site paths, so the link can never send someone off the app.
    router.replace(next?.startsWith("/") && !next.startsWith("//") ? next : "/discover");
  }

  return (
    <main className="relative flex min-h-dvh flex-1 flex-col overflow-hidden bg-onyx">
      <div className="absolute inset-x-0 top-0 flex flex-col gap-3 pt-6 opacity-40">
        <Marquee looks={libraryLooks} duration={120} />
        <Marquee looks={libraryLooks} offset={6} duration={100} reverse tone="champagne" />
      </div>
      <div className="absolute inset-0 bg-linear-to-t from-onyx via-onyx/70 to-transparent" aria-hidden />
      <div className="relative mx-auto flex w-full max-w-md flex-1 flex-col justify-end gap-6 p-6 lg:justify-center">
        <div className="flex gap-2" aria-label={`Step ${step + 1} of ${steps.length + 1}`}>
          {[...steps, null].map((_, i) => (
            <span key={i} className={`h-1 flex-1 rounded-full transition-colors duration-200 ease-out ${i <= step ? "bg-ivory" : "bg-hairline"}`} />
          ))}
        </div>
        {last ? (
          <div key="profile" className="flex animate-rise flex-col gap-6">
            <h1 className="font-serif text-headline">What&apos;s your hair like now?</h1>
            <ChoiceRow label="Length" options={LENGTHS} value={length} onChange={setLength} />
            <ChoiceRow label="Texture" options={TEXTURES} value={texture} onChange={setTexture} />
            <p className="text-caption text-stone">Optional. It only tunes which looks you see first.</p>
          </div>
        ) : (
          <div key={step} className="flex flex-col gap-3">
            <p className="animate-fade text-caption tracking-widest text-stone uppercase">Step {step + 1}</p>
            <h1 className="font-serif text-display">
              <RevealText text={steps[step].title} />
            </h1>
            <p className="animate-rise text-lead text-stone" style={{ animationDelay: "250ms" }}>
              {steps[step].body}
            </p>
          </div>
        )}
        <div className="flex gap-2">
          {step > 0 && (
            <Button variant="ghost" onClick={() => setStep(step - 1)}>
              Back
            </Button>
          )}
          <Button className="flex-1" onClick={() => (last ? finish() : setStep(step + 1))}>
            {last ? (next ? "Let's try it" : "Start browsing") : "Next"}
          </Button>
        </div>
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
