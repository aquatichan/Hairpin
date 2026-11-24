"use client";

import { useEffect, useId, useState } from "react";
import { resizeToJpeg } from "@/lib/image";
import { localStore, type StoredPhoto } from "@/lib/local-store";
import { Dither } from "../fx/dither";
import { Button, buttonClass } from "../ui/button";
import { Notice } from "../ui/notice";

const CONSENT = "My photo is sent to the AI provider I chose, only to make my previews. It stays on this device otherwise, and I can delete it anytime.";

async function readPhoto(file: File) {
  // Downscaled and re-encoded as JPEG: small enough for the provider and stripped of metadata such as location.
  return resizeToJpeg(file);
}

/** The empty stage: pick or take one photo, preview it, agree, save. */
export function PhotoSetup() {
  const [picked, setPicked] = useState<Blob | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const consentId = useId();

  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  async function onPick(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      const blob = await readPhoto(file);
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
    <div className="flex flex-col gap-4">
      <div className="surface relative aspect-[4/5] overflow-hidden rounded-card border-dashed">
        {!preview && <Dither className="opacity-[0.16]" cell={5} interactive />}
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element -- local blob URL
          <img src={preview} alt="The photo you picked" className="absolute inset-0 size-full object-cover" />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-8 text-center">
            <FaceGuide />
            <p className="font-serif text-title">Add your photo</p>
            <p className="max-w-xs text-body text-stone">Face the camera in soft, even light, with your whole face and hair in frame. No hats or filters.</p>
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <label className={`${buttonClass(preview ? "ghost" : "primary")} flex-1 cursor-pointer focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-champagne-light`}>
          {preview ? "Choose another" : "Choose a photo"}
          <input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" className="sr-only" onChange={(e) => onPick(e.target.files?.[0])} />
        </label>
        <label className={`${buttonClass("ghost")} flex-1 cursor-pointer focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-champagne-light lg:hidden`}>
          Take a selfie
          <input type="file" accept="image/*" capture="user" className="sr-only" onChange={(e) => onPick(e.target.files?.[0])} />
        </label>
      </div>
      {picked && (
        <>
          <label htmlFor={consentId} className="flex cursor-pointer items-start gap-3 text-body text-stone">
            <input id={consentId} type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 size-4 shrink-0 accent-champagne" />
            {CONSENT}
          </label>
          <Button onClick={save} disabled={!consent}>
            Use this photo
          </Button>
        </>
      )}
      {error && <Notice tone="error">{error}</Notice>}
    </div>
  );
}

/** The saved photo in the side panel, with replace and a two-step remove. */
export function PhotoCard({ photo, onError }: { photo: StoredPhoto; onError: (message: string) => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    const u = URL.createObjectURL(photo.blob);
    queueMicrotask(() => setUrl(u));
    return () => URL.revokeObjectURL(u);
  }, [photo.blob]);

  async function replace(file: File | undefined) {
    if (!file) return;
    try {
      // Consent was given for "my photo"; replacing keeps it and the panel repeats what happens to it.
      await localStore.put("photo", { ...photo, blob: await readPhoto(file), createdAt: Date.now() });
    } catch {
      onError("That file couldn't be read as a photo. Try a JPEG or PNG.");
    }
  }

  return (
    <div className="flex items-center gap-4">
      <div className="relative size-16 shrink-0 overflow-hidden rounded-card bg-graphite">
        {/* eslint-disable-next-line @next/next/no-img-element -- local blob URL */}
        {url && <img src={url} alt="Your photo" className="absolute inset-0 size-full object-cover" />}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="text-body font-medium">Your photo</p>
        <p className="text-caption text-stone">Private, kept on this device.</p>
      </div>
      {confirming ? (
        <div className="flex shrink-0 gap-2">
          <button type="button" onClick={() => localStore.remove("photo", "active")} className="rounded-full border border-ivory px-3 py-1.5 text-caption font-medium hover:bg-ivory hover:text-onyx">
            Remove
          </button>
          <button type="button" onClick={() => setConfirming(false)} className="rounded-full px-3 py-1.5 text-caption text-stone hover:text-ivory">
            Keep
          </button>
        </div>
      ) : (
        <div className="flex shrink-0 gap-1">
          <label className="cursor-pointer rounded-full border border-hairline px-3 py-1.5 text-caption font-medium hover:border-stone/50 focus-within:outline-2 focus-within:outline-champagne-light">
            Replace
            <input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" className="sr-only" onChange={(e) => replace(e.target.files?.[0])} />
          </label>
          <button type="button" onClick={() => setConfirming(true)} className="rounded-full px-3 py-1.5 text-caption text-stone hover:text-ivory">
            Remove
          </button>
        </div>
      )}
    </div>
  );
}

function FaceGuide() {
  return (
    <svg viewBox="0 0 64 64" className="size-14 text-champagne" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden>
      <ellipse cx="32" cy="34" rx="13" ry="16" strokeDasharray="3 3" />
      <path d="M19 27c2-9 8-13 13-13s11 4 13 13" />
      <path d="M8 16V8h8M56 16V8h-8M8 48v8h8M56 48v8h-8" />
    </svg>
  );
}
