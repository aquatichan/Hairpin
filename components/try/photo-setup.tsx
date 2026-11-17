"use client";

import { useState } from "react";
import { resizeToJpeg } from "@/lib/image";
import { localStore } from "@/lib/local-store";
import { Button, buttonClass } from "../ui/button";
import { Notice } from "../ui/notice";

/** First step of the try flow: save one private photo, with explicit consent. */
export function PhotoSetup() {
  const [picked, setPicked] = useState<Blob | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onPick(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      const blob = await resizeToJpeg(file);
      if (preview) URL.revokeObjectURL(preview);
      setPicked(blob);
      setPreview(URL.createObjectURL(blob));
    } catch {
      setError("That file couldn't be read as a photo. Try a JPEG or PNG.");
    }
  }

  async function save() {
    if (!picked || !consent) return;
    const now = Date.now();
    await localStore.put("photo", { id: "active", blob: picked, consentAt: now, createdAt: now });
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 py-6">
      <h1 className="font-serif text-headline">Add your photo</h1>
      <p className="text-body text-stone">One photo, used for every try-on. Face the camera, in good light, with your face and hair fully in frame.</p>
      <div className="relative aspect-[4/5] overflow-hidden rounded-card border border-dashed border-hairline bg-graphite">
        {/* eslint-disable-next-line @next/next/no-img-element -- local blob URL */}
        {preview && <img src={preview} alt="Your photo" className="absolute inset-0 size-full object-cover" />}
      </div>
      <div className="flex gap-2">
        <label className={`${buttonClass("ghost")} flex-1 cursor-pointer`}>
          {preview ? "Choose another" : "Choose a photo"}
          <input type="file" accept="image/*" className="sr-only" onChange={(e) => onPick(e.target.files?.[0])} />
        </label>
        <label className={`${buttonClass("ghost")} flex-1 cursor-pointer lg:hidden`}>
          Take a photo
          <input type="file" accept="image/*" capture="user" className="sr-only" onChange={(e) => onPick(e.target.files?.[0])} />
        </label>
      </div>
      <label className="flex items-start gap-3 text-body">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1 size-4 accent-crimson" />
        My photo is sent to an AI provider to make previews. It stays private and I can delete it anytime.
      </label>
      {error && <Notice tone="error">{error}</Notice>}
      <Button onClick={save} disabled={!picked || !consent}>
        Save my photo
      </Button>
    </div>
  );
}
