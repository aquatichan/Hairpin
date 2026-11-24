"use client";

import { useEffect, useId, useState } from "react";
import { ApiClientError, apiFetch } from "@/lib/api-client";
import { shareCut, useCommunity } from "@/lib/community";
import type { DecodedCut } from "@/lib/brief";
import { processCutImage, type ProcessedImage } from "@/lib/image-pipeline";
import { resizeToJpeg } from "@/lib/image";
import { localStore, type StoredCut } from "@/lib/local-store";
import { textureOf, type HairType } from "@/lib/hair-types";
import { AUDIENCES, STYLE_TAGS, tagLabel, type Audience, type StyleTag } from "@/lib/style";
import { useBlobUrl } from "@/lib/use-local";
import { HairTypePicker } from "../hair/hair-type-picker";
import { BottomSheet } from "../ui/bottom-sheet";
import { Button, buttonClass } from "../ui/button";
import { Chip } from "../ui/chip";
import { HairpinLoader } from "../ui/hairpin-loader";
import { CloseIcon } from "../ui/icons";
import { Notice } from "../ui/notice";

const LENGTHS = ["short", "medium", "long"] as const;
const AUDIENCE_LABEL: Record<Audience, string> = { men: "Men's", women: "Women's", any: "Any" };
const MAX_TAGS = 6;
const input = "h-12 w-full rounded-card border border-hairline bg-slate px-4 text-body text-ivory placeholder:text-stone focus-visible:outline-2 focus-visible:outline-champagne-light";

/** Control and bidi characters out, whitespace collapsed, length capped. */
export const cleanText = (v: string, max: number) =>
  v
    .replace(/[\p{Cc}\p{Cf}\u2028\u2029]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);

export type CutPrefill = { image: Blob; name?: string; description?: string };

/**
 * Add a cut of your own: the photo is shrunk in the loading screen (lib/image-pipeline.ts), described, and saved
 * privately on this device. It then shows up under Discover > Mine, in Saved and in Try.
 */
export function AddCutSheet({ open, onClose, prefill, onAdded }: { open: boolean; onClose: () => void; prefill?: CutPrefill | null; onAdded?: (cut: StoredCut) => void }) {
  return (
    <BottomSheet open={open} onClose={onClose} label="Add a cut" labelledBy="add-cut-title" size="wide">
      {open && <AddCutForm key={prefill ? "prefill" : "blank"} prefill={prefill ?? null} onClose={onClose} onAdded={onAdded} />}
    </BottomSheet>
  );
}

function AddCutForm({ prefill, onClose, onAdded }: { prefill: CutPrefill | null; onClose: () => void; onAdded?: (cut: StoredCut) => void }) {
  const [image, setImage] = useState<ProcessedImage | null>(null);
  const [processing, setProcessing] = useState(false);
  const [name, setName] = useState(prefill?.name ?? "");
  const [description, setDescription] = useState(prefill?.description ?? "");
  const [audience, setAudience] = useState<Audience | null>(null);
  const [length, setLength] = useState<(typeof LENGTHS)[number] | null>(null);
  const [hairType, setHairType] = useState<HairType | null>(null);
  const [tags, setTags] = useState<StyleTag[]>([]);
  const [consent, setConsent] = useState(false);
  const [visibility, setVisibility] = useState<"private" | "public">("private");
  const [license, setLicense] = useState(false);
  const [savedNote, setSavedNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filling, setFilling] = useState(false);
  const [saving, setSaving] = useState(false);
  const preview = useBlobUrl(image?.blob);
  const consentId = useId();
  // Known once Discover has asked the server; elsewhere an attempt that can't be made fails gracefully and keeps the cut private.
  const sharingOff = useCommunity().unavailable;

  async function take(file: Blob) {
    setError(null);
    setProcessing(true);
    try {
      const [processed] = await Promise.all([processCutImage(file), new Promise((r) => setTimeout(r, 700))]);
      setImage(processed);
    } catch (e) {
      setError(e instanceof Error && e.message.includes("small") ? e.message : "That file couldn't be read as a photo. Try a JPEG, PNG or WebP.");
    } finally {
      setProcessing(false);
    }
  }

  // A photo handed over from Decode is processed straight away.
  useEffect(() => {
    if (prefill) queueMicrotask(() => void take(prefill.image));
    // Once, when the form opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Optional: let the person's AI name and describe the cut. Skipped cleanly if it isn't available. */
  async function autofill() {
    if (!image) return;
    setFilling(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("image", await resizeToJpeg(image.blob, 1024, 0.82), "cut.jpg");
      const res = await apiFetch("/api/decode", { method: "POST", body: form });
      const { cut, mock } = (await res.json()) as { cut: DecodedCut; mock: boolean };
      if (!mock) {
        setName((n) => n || cleanText(cut.styleName, 60));
        setDescription((d) => d || cleanText(`${cut.summary} ${cut.askFor[0] ? `Ask for: ${cut.askFor[0]}` : ""}`, 280));
      } else setError("Demo mode: nothing was filled in.");
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : "Couldn't fill it in. You can type it yourself.");
    } finally {
      setFilling(false);
    }
  }

  const ready = Boolean(image && cleanText(name, 60) && hairType && audience && length && consent && (visibility === "private" || license));

  async function save() {
    if (!image || !hairType || !audience || !length || !ready || saving) return;
    setSaving(true);
    const cut: StoredCut = {
      id: `m-${crypto.randomUUID()}`,
      image: image.blob,
      name: cleanText(name, 60),
      description: cleanText(description, 280),
      audience,
      length,
      hairType,
      tags,
      width: image.width,
      height: image.height,
      shared: null,
      createdAt: Date.now(),
    };
    try {
      // Always kept on this device first, so a failed share never loses the cut.
      await localStore.put("cuts", cut);
      onAdded?.(cut);
      if (visibility === "public") {
        const shared = await shareCut(cut);
        if (!shared.ok) {
          setSavedNote(`Saved privately on this device. ${shared.message}`);
          setSaving(false);
          return;
        }
      }
      onClose();
    } catch {
      setError("This cut couldn't be saved on this device. Your browser may be out of space.");
      setSaving(false);
    }
  }

  const toggleTag = (t: StyleTag) => setTags((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : cur.length < MAX_TAGS ? [...cur, t] : cur));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 id="add-cut-title" className="font-serif text-headline">
            Add a cut
          </h2>
          <p className="text-body text-stone">Saved privately on this device. It shows up in Discover under Mine, in Saved, and in Try.</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="grid size-10 shrink-0 place-items-center rounded-full text-stone transition-colors hover:bg-slate hover:text-ivory focus-visible:outline-2 focus-visible:outline-champagne-light">
          <CloseIcon />
        </button>
      </div>

      <div className="flex flex-col gap-6 md:grid md:grid-cols-[minmax(0,18rem)_minmax(0,1fr)] md:gap-8">
        <div className="flex flex-col gap-3">
          <div className="relative aspect-[3/4] overflow-hidden rounded-card border border-dashed border-hairline bg-graphite">
            {processing ? (
              <HairpinLoader variant="panel" label="Preparing your photo" steps={["Shrinking your photo", "Removing location data", "Ready"]} stepEvery={600} />
            ) : preview ? (
              // eslint-disable-next-line @next/next/no-img-element -- local blob URL
              <img src={preview} alt="The cut you're adding" className="absolute inset-0 size-full object-contain" />
            ) : (
              <p className="absolute inset-0 grid place-items-center p-6 text-center text-body text-stone">Add a clear photo where the hair is the subject.</p>
            )}
          </div>
          <label className={`${buttonClass(image ? "ghost" : "primary")} cursor-pointer focus-within:outline-2 focus-within:outline-champagne-light`}>
            {image ? "Choose another photo" : "Choose a photo"}
            <input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" className="sr-only" onChange={(e) => e.target.files?.[0] && take(e.target.files[0])} />
          </label>
          {image && (
            <p className="text-caption text-stone">
              Made small for you: {image.width}×{image.height}, {Math.round(image.blob.size / 1024)} KB, location data removed.
            </p>
          )}
          {image && (
            <Button variant="ghost" onClick={autofill} disabled={filling}>
              {filling ? "Reading the cut…" : "Fill in from the photo (uses your AI)"}
            </Button>
          )}
        </div>

        <div className="flex flex-col gap-5">
          <label className="flex flex-col gap-2">
            <span className="text-body text-stone">Name</span>
            <input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="e.g. Textured crop with fade" className={input} />
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-body text-stone">What to ask your barber for</span>
            <textarea value={description} maxLength={280} rows={3} onChange={(e) => setDescription(e.target.value)} placeholder="Short sides, longer textured top, soft fringe…" className={`${input} h-auto py-3`} />
          </label>
          <div role="group" aria-label="Who is it for" className="flex flex-col gap-2">
            <p className="text-body text-stone">Who is it for</p>
            <div className="flex flex-wrap gap-2">
              {AUDIENCES.map((a) => (
                <Chip key={a} selected={audience === a} onClick={() => setAudience(a)}>
                  {AUDIENCE_LABEL[a]}
                </Chip>
              ))}
            </div>
          </div>
          <div role="group" aria-label="Length" className="flex flex-col gap-2">
            <p className="text-body text-stone">Length</p>
            <div className="flex flex-wrap gap-2">
              {LENGTHS.map((l) => (
                <Chip key={l} selected={length === l} onClick={() => setLength(l)}>
                  <span className="capitalize">{l}</span>
                </Chip>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-body text-stone">Hair type in the photo</p>
            <HairTypePicker value={hairType} onChange={setHairType} compact />
            {hairType && <p className="text-caption text-stone capitalize">{textureOf(hairType)}</p>}
          </div>
          <div role="group" aria-label="Tags" className="flex flex-col gap-2">
            <p className="text-body text-stone">
              Tags <span className="text-caption">({tags.length}/{MAX_TAGS})</span>
            </p>
            <div className="flex flex-wrap gap-2">
              {STYLE_TAGS.map((t) => (
                <Chip key={t} selected={tags.includes(t)} onClick={() => toggleTag(t)}>
                  {tagLabel(t)}
                </Chip>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div role="group" aria-label="Who can see it" className="flex flex-col gap-3 border-t border-hairline pt-5">
        <p className="text-body text-stone">Who can see it</p>
        <div className="flex flex-wrap gap-2">
          <Chip selected={visibility === "private"} onClick={() => setVisibility("private")}>
            Just me
          </Chip>
          {!sharingOff && (
            <Chip selected={visibility === "public"} onClick={() => setVisibility("public")}>
              Share publicly (reviewed first)
            </Chip>
          )}
        </div>
        {sharingOff && <p className="text-caption text-stone">Sharing with other members isn&apos;t switched on yet. Your cuts stay private on this device.</p>}
        {visibility === "public" && (
          <div className="flex flex-col gap-3 rounded-[var(--r-tile)] border border-hairline p-4">
            <p className="text-caption text-stone">
              We check every shared cut before anyone else sees it, and you can take it down any time from Mine. Don&apos;t share photos of children, or anyone who hasn&apos;t agreed.
              Face photos are visible to other members once approved.
            </p>
            <label htmlFor={`${consentId}-license`} className="flex cursor-pointer items-start gap-3 text-body">
              <input id={`${consentId}-license`} type="checkbox" checked={license} onChange={(e) => setLicense(e.target.checked)} className="mt-0.5 size-4 shrink-0 accent-champagne" />
              I&apos;m happy for Hairpin to show this photo and its details to other members until I delete it.
            </label>
          </div>
        )}
      </div>

      <label htmlFor={consentId} className="flex cursor-pointer items-start gap-3 text-body text-stone">
        <input id={consentId} type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 size-4 shrink-0 accent-champagne" />
        This is my own photo, or I have permission to use it. The hair is the subject.
      </label>
      {error && <Notice tone="error">{error}</Notice>}
      {savedNote && <Notice>{savedNote}</Notice>}
      <div className="flex flex-wrap items-center gap-3">
        {savedNote ? (
          <Button onClick={onClose}>Done</Button>
        ) : (
          <>
            <Button onClick={save} disabled={!ready || saving}>
              {visibility === "public" ? "Add and share for review" : "Add to my cuts"}
            </Button>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
          </>
        )}
        {!ready && image && <p className="text-caption text-stone">Add a name, who it&apos;s for, length, hair type and tick the box.</p>}
      </div>
    </div>
  );
}
