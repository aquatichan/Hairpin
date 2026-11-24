"use client";

import Image from "next/image";
import { useState } from "react";
import { ApiClientError, apiFetch } from "@/lib/api-client";
import type { HairAnalysis } from "@/lib/hair-analysis";
import { HAIR_TYPE_INFO, hairTypeImage, hairTypeLabel, textureOf } from "@/lib/hair-types";
import { resizeToJpeg } from "@/lib/image";
import { localStore } from "@/lib/local-store";
import { saveProfile } from "@/lib/profile";
import { useLocal } from "@/lib/use-local";
import { HairpinLoader } from "../ui/hairpin-loader";
import { Button, buttonClass } from "../ui/button";
import { Notice } from "../ui/notice";

type State = { stage: "idle" } | { stage: "busy"; preview: string } | { stage: "done"; preview: string; result: HairAnalysis; mock: boolean } | { stage: "error"; message: string };

/**
 * "Read my hair from a photo": the AI suggests a hair type, length, colour and density; nothing is saved until the
 * person accepts it. The photo goes to their AI provider for this one request and isn't kept anywhere.
 */
export function HairAnalysisPanel({ onApplied }: { onApplied?: (a: HairAnalysis) => void }) {
  const saved = useLocal(() => localStore.get("photo", "active").then((p) => p ?? null), "photo");
  const [state, setState] = useState<State>({ stage: "idle" });

  async function analyse(source: Blob) {
    let photo: Blob;
    try {
      photo = await resizeToJpeg(source, 1280, 0.86);
    } catch {
      setState({ stage: "error", message: "That file couldn't be read as a photo." });
      return;
    }
    const preview = URL.createObjectURL(photo);
    setState({ stage: "busy", preview });
    try {
      const form = new FormData();
      form.set("photo", photo, "hair.jpg");
      const res = await apiFetch("/api/analyze-hair", { method: "POST", body: form });
      const { analysis, mock } = (await res.json()) as { analysis: HairAnalysis; mock: boolean };
      setState({ stage: "done", preview, result: analysis, mock });
    } catch (e) {
      setState({ stage: "error", message: e instanceof ApiClientError ? e.message : "Something went wrong. Please try again." });
    }
  }

  function apply(a: HairAnalysis) {
    saveProfile({ hairType: a.hairType, texture: textureOf(a.hairType), length: a.length, color: a.color, density: a.density });
    onApplied?.(a);
    setState({ stage: "idle" });
  }

  if (state.stage === "busy") {
    return (
      <div className="relative aspect-[16/9] overflow-hidden rounded-[var(--r-tile)]">
        <HairpinLoader variant="panel" label="Reading your hair" steps={["Looking at your hair", "Finding the pattern", "Matching your type"]} />
      </div>
    );
  }

  if (state.stage === "done") {
    const a = state.result;
    return (
      <div className="surface-raised stagger-in flex flex-col gap-4 rounded-[var(--r-tile)] p-4">
        {state.mock && <Notice>Demo mode: no AI looked at this photo.</Notice>}
        <div className="flex gap-4">
          <span className="relative size-24 shrink-0 overflow-hidden rounded-[calc(var(--r-tile)-1rem)]">
            <Image src={hairTypeImage(a.hairType)} alt="" fill sizes="96px" className="object-cover" />
          </span>
          <div className="flex min-w-0 flex-col gap-1">
            <p className="text-caption tracking-widest text-champagne uppercase">Looks like</p>
            <p className="font-serif text-headline leading-none">
              {hairTypeLabel(a.hairType)} <span className="text-title text-stone">{HAIR_TYPE_INFO[a.hairType].name}</span>
            </p>
            <p className="text-body text-stone capitalize">
              {a.length} · {a.color} · {a.density}
            </p>
          </div>
        </div>
        {a.notes && <p className="text-caption text-stone">{a.notes}</p>}
        {a.confidence === "low" && <p className="text-caption text-ivory">Not very sure from this photo. Check it below, or try one with your hair loose and in good light.</p>}
        <div className="flex flex-wrap gap-3">
          <Button onClick={() => apply(a)}>That&apos;s my hair</Button>
          <Button variant="ghost" onClick={() => setState({ stage: "idle" })}>
            I&apos;ll pick myself
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        {saved && (
          <Button variant="ghost" onClick={() => analyse(saved.blob)}>
            Read my hair from my saved photo
          </Button>
        )}
        <label className={`${buttonClass(saved ? "ghost" : "primary")} cursor-pointer focus-within:outline-2 focus-within:outline-champagne-light`}>
          {saved ? "Use another photo" : "Read my hair from a photo"}
          <input type="file" accept="image/*" capture="user" className="sr-only" onChange={(e) => e.target.files?.[0] && analyse(e.target.files[0])} />
        </label>
      </div>
      <p className="text-caption text-stone">The photo is sent to your AI provider to read your hair type, length and colour, then discarded. Nothing is saved until you accept it.</p>
      {state.stage === "error" && <Notice tone="error">{state.message}</Notice>}
    </div>
  );
}
