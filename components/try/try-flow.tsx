"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ApiClientError } from "@/lib/api-client";
import { resizeToJpeg } from "@/lib/image";
import { localStore, type StoredRender } from "@/lib/local-store";
import { takePendingReference } from "@/lib/handoff";
import { requestRender } from "@/lib/tryon-client";
import { libraryLooks } from "@/lib/looks";
import { useBlobUrl, useLocal } from "@/lib/use-local";
import { BeforeAfter } from "../ui/before-after";
import { BlobImage } from "../ui/blob-image";
import { Button, buttonClass } from "../ui/button";
import { Chip } from "../ui/chip";
import { Notice } from "../ui/notice";
import { Skeleton } from "../ui/skeleton";
import { PhotoSetup } from "./photo-setup";

const TWEAKS = ["Shorter", "Longer", "More volume", "Curtain fringe", "Lower fade", "Messier texture"];

export function TryFlow() {
  const lookId = useSearchParams().get("look");
  const look = libraryLooks.find((l) => l.id === lookId) ?? null;
  const photo = useLocal(() => localStore.get("photo", "active").then((p) => p ?? null), "photo");
  const photoUrl = useBlobUrl(photo?.blob);

  const [reference, setReference] = useState<Blob | null>(null);
  const [session, setSession] = useState<StoredRender[]>([]);
  const [current, setCurrent] = useState<StoredRender | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiClientError | null>(null);
  const inFlight = useRef(false);
  const currentUrl = useBlobUrl(current?.result);

  // Pick up a screenshot handed over from the analyzer each time this screen is shown.
  useEffect(() => {
    const handed = takePendingReference();
    if (!handed) return;
    queueMicrotask(() => {
      setReference(handed);
      setCurrent(null);
      setError(null);
    });
  }, []);

  if (photo === undefined) return <div className="mx-auto max-w-md px-4 py-6"><Skeleton className="aspect-[4/5]" /></div>;
  if (photo === null) return <PhotoSetup />;

  const targetName = reference ? "Your screenshot" : look?.name ?? null;

  async function render(tweak: string | null) {
    // The ref guards against a double tap starting two paid renders.
    if (!photo || !targetName || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const made = await requestRender({ photo: photo.blob, reference, lookId: look?.id ?? null, lookName: targetName, tweak });
      setSession((s) => [made, ...s]);
      setCurrent(made);
    } catch (e) {
      setError(e instanceof ApiClientError ? e : new ApiClientError("Something went wrong. Please try again.", "unknown"));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  async function onReference(file: File | undefined) {
    if (!file) return;
    try {
      setReference(await resizeToJpeg(file, 1024, 0.85));
      setCurrent(null);
      setError(null);
    } catch {
      setError(new ApiClientError("That file couldn't be read as an image.", "bad_file"));
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 py-6">
      <h1 className="font-serif text-headline">{targetName ?? "Try a cut"}</h1>

      {current && photoUrl && currentUrl ? (
        <BeforeAfter before={photoUrl} after={currentUrl} label={`Compare before and after: ${current.lookName}`} />
      ) : (
        <div className="relative">
          <BlobImage blob={photo.blob} alt="Your photo" />
          {busy && <div className="absolute inset-0 animate-pulse rounded-card bg-ivory/10" aria-hidden />}
        </div>
      )}

      {current?.mock && <Notice>Demo mode: this is your original photo, not an AI render.</Notice>}
      {busy && <Notice>Cutting… this can take a little while.</Notice>}
      {error && (
        <Notice tone="error">
          {error.message}{" "}
          {error.topUpUrl && (
            <a href={error.topUpUrl} className="underline underline-offset-4" target="_blank" rel="noreferrer">
              Top up
            </a>
          )}
        </Notice>
      )}

      {current ? (
        <>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Adjust this cut">
            {TWEAKS.map((t) => (
              <Chip key={t} selected={current.tweak === t} onClick={() => render(t)}>
                {t}
              </Chip>
            ))}
          </div>
          <Link href={`/brief?render=${current.id}`} className={buttonClass("primary")}>
            Make my Barber Brief
          </Link>
        </>
      ) : (
        <Button onClick={() => render(null)} disabled={busy || !targetName}>
          {targetName ? "Try this cut on me" : "Pick a look first"}
        </Button>
      )}

      <div className="flex gap-2">
        <label className={`${buttonClass("ghost")} flex-1 cursor-pointer`}>
          {reference ? "Change screenshot" : "Try a screenshot"}
          <input type="file" accept="image/*" className="sr-only" onChange={(e) => onReference(e.target.files?.[0])} />
        </label>
        <Link href="/discover" className={`${buttonClass("ghost")} flex-1`}>
          Browse looks
        </Link>
      </div>
      {reference && <p className="text-caption text-stone">Your screenshot is only used for your own render and is never published.</p>}

      {session.length > 1 && (
        <ul className="flex gap-2 overflow-x-auto" aria-label="This session's renders">
          {session.map((r) => (
            <li key={r.id} className="w-20 shrink-0">
              <button type="button" onClick={() => setCurrent(r)} aria-label={`Show ${r.lookName}${r.tweak ? `, ${r.tweak}` : ""}`} aria-pressed={current?.id === r.id} className="block w-full">
                <BlobImage blob={r.result} alt="" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
