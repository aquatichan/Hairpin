"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { ApiClientError, apiFetch } from "@/lib/api-client";
import type { DecodedCut } from "@/lib/brief";
import { setPendingReference } from "@/lib/handoff";
import { resizeToJpeg } from "@/lib/image";
import { BlobImage } from "./ui/blob-image";
import { Button, buttonClass } from "./ui/button";
import { Notice } from "./ui/notice";

const rows: { key: "top" | "sides" | "back" | "texture"; label: string }[] = [
  { key: "top", label: "Top" },
  { key: "sides", label: "Sides" },
  { key: "back", label: "Back" },
  { key: "texture", label: "Texture" },
];

/** The analyzer: upload any photo of a haircut and get it named and described in barber terms. */
export function DecodeFlow() {
  const router = useRouter();
  const [image, setImage] = useState<Blob | null>(null);
  const [result, setResult] = useState<{ cut: DecodedCut; mock: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  async function onPick(file: File | undefined) {
    if (!file) return;
    setError(null);
    setResult(null);
    try {
      setImage(await resizeToJpeg(file, 1280, 0.85));
    } catch {
      setError("That file couldn't be read as an image.");
    }
  }

  async function analyse() {
    if (!image || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("image", image, "cut.jpg");
      const response = await apiFetch("/api/decode", { method: "POST", body: form });
      setResult(await response.json());
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : "Something went wrong. Please try again.");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  function tryIt() {
    setPendingReference(image);
    router.push("/try");
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 py-6">
      <h1 className="font-serif text-headline">Decode a cut</h1>
      <p className="text-body text-stone">Seen a haircut you like? Upload the screenshot and find out what it&apos;s called and how to ask for it.</p>

      {image ? (
        <div className="relative">
          <BlobImage blob={image} alt="The haircut you uploaded" />
          {busy && <div className="absolute inset-0 animate-pulse rounded-card bg-ivory/10" aria-hidden />}
        </div>
      ) : (
        <label className="flex aspect-[4/5] cursor-pointer flex-col items-center justify-center gap-2 rounded-card border border-dashed border-hairline bg-graphite text-center transition-colors duration-200 ease-out hover:border-stone">
          <span className="font-serif text-title">Add a screenshot</span>
          <span className="text-caption text-stone">TikTok, Instagram, a photo of a friend</span>
          <input type="file" accept="image/*" className="sr-only" onChange={(e) => onPick(e.target.files?.[0])} />
        </label>
      )}

      {busy && <Notice>Reading the cut…</Notice>}
      {error && <Notice tone="error">{error}</Notice>}

      {result && (
        <article className="flex animate-rise flex-col gap-4 rounded-card border border-hairline bg-graphite p-4">
          {result.mock && <Notice>Demo mode: no AI looked at this image.</Notice>}
          <div className="flex items-start justify-between gap-3">
            <h2 className="font-serif text-title">{result.cut.styleName}</h2>
            <span className="shrink-0 rounded-full border border-hairline px-3 py-1 text-caption text-stone capitalize">{result.cut.upkeep} upkeep</span>
          </div>
          <p className="text-body text-stone">{result.cut.summary}</p>
          <dl className="flex flex-col">
            {rows.map(({ key, label }) => (
              <div key={key} className="flex gap-4 border-t border-hairline py-3">
                <dt className="w-16 shrink-0 text-caption tracking-widest text-stone uppercase">{label}</dt>
                <dd className="text-body">{result.cut[key]}</dd>
              </div>
            ))}
          </dl>
          {result.cut.askFor.length > 0 && (
            <div className="flex flex-col gap-2 border-t border-hairline pt-3">
              <h3 className="text-caption tracking-widest text-stone uppercase">Say this to your barber</h3>
              <ul className="flex flex-col gap-1 text-body">
                {result.cut.askFor.map((line) => (
                  <li key={line}>“{line}”</li>
                ))}
              </ul>
            </div>
          )}
        </article>
      )}

      {image && !result && (
        <Button onClick={analyse} disabled={busy}>
          Decode this cut
        </Button>
      )}
      {result && <Button onClick={tryIt}>Try it on me</Button>}
      {image && (
        <label className={`${buttonClass("ghost")} cursor-pointer`}>
          Choose another image
          <input type="file" accept="image/*" className="sr-only" onChange={(e) => onPick(e.target.files?.[0])} />
        </label>
      )}
      <p className="text-caption text-stone">The analyzer describes the haircut only. It never rates or comments on anyone&apos;s face.</p>
    </div>
  );
}
