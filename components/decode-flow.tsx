"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { ApiClientError, apiFetch } from "@/lib/api-client";
import type { DecodedCut } from "@/lib/brief";
import { setPendingReference } from "@/lib/handoff";
import { resizeToJpeg } from "@/lib/image";
import { DECODE_KEEP, localStore, newId, type StoredDecode } from "@/lib/local-store";
import { useLocal } from "@/lib/use-local";
import { AddCutSheet } from "./cuts/add-cut";
import { Bloom } from "./fx/bloom";
import { Dither } from "./fx/dither";
import { BlobImage } from "./ui/blob-image";
import { Button, buttonClass } from "./ui/button";
import { Notice } from "./ui/notice";
import { HairpinLoader } from "./ui/hairpin-loader";
import { Page, type Backdrop } from "./ui/page";
import { PageHeader } from "./ui/page-header";

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
  const [topUpUrl, setTopUpUrl] = useState<string | null>(null);
  const inFlight = useRef(false);
  // Decode always opens clean. What was decoded before is kept on this device and offered below, never auto-loaded.
  const history = useLocal(() => localStore.list("decode"), "decode");
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  function reset() {
    setImage(null);
    setResult(null);
    setError(null);
    setTopUpUrl(null);
    setCurrentId(null);
  }

  function open(row: StoredDecode) {
    setError(null);
    setImage(row.image);
    setResult({ cut: row.cut, mock: row.mock });
    setCurrentId(row.id);
  }

  async function onPick(file: File | undefined | Blob) {
    if (!file) return;
    setError(null);
    setResult(null);
    setCurrentId(null);
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
      const data = (await response.json()) as { cut: DecodedCut; mock: boolean };
      setResult(data);
      // Keep it on this device (newest 12). A failure to save never costs the person their result.
      const id = currentId ?? newId();
      setCurrentId(id);
      localStore
        .put("decode", { id, image, cut: data.cut, mock: data.mock, createdAt: Date.now() })
        .then(() => localStore.prune("decode", DECODE_KEEP))
        .catch(() => {});
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : "Something went wrong. Please try again.");
      setTopUpUrl(e instanceof ApiClientError ? (e.topUpUrl ?? null) : null);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  function tryIt() {
    if (!image) return;
    // Decode's name and summary travel with the screenshot so the studio can offer an honest written alternative.
    setPendingReference({ blob: image, name: result && !result.mock ? result.cut.styleName : null, summary: result && !result.mock ? result.cut.summary : null });
    router.push("/try");
  }

  const [dragging, setDragging] = useState(false);
  const last = history?.[0] ?? null;

  return (
    <Page backdrop={DECODE_BACKDROP}>
      <PageHeader
        eyebrow="Decode"
        title={
          <>
            Decode a <em className="accent-word">cut</em>
          </>
        }
        description="Seen a haircut you like? Upload the screenshot and find out what it's called and how to ask for it."
      />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:items-start lg:gap-12 2xl:grid-cols-[minmax(0,30rem)_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          {image ? (
            <div className="relative overflow-hidden rounded-card">
              <BlobImage blob={image} alt="The haircut you uploaded" />
              {busy && <HairpinLoader variant="panel" label="Decoding your cut" steps={["Looking at the cut", "Naming it", "Writing it in barber terms"]} />}
            </div>
          ) : (
            <label
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                onPick(e.dataTransfer.files?.[0]);
              }}
              className={`surface relative isolate flex aspect-[4/5] cursor-pointer flex-col items-center justify-center gap-3 overflow-hidden rounded-card border-dashed text-center transition-colors duration-200 ease-out focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-champagne-light hover:border-champagne/60 ${dragging ? "border-champagne" : ""}`}
            >
              <Dither className="-z-10 opacity-[0.16]" cell={5} interactive />
              <Bloom name="bloom-3" className="absolute -right-8 -bottom-6 -z-10 w-40 opacity-60" rotate={20} />
              <span aria-hidden className="grid size-14 place-items-center rounded-full border border-champagne/50 text-champagne">
                <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
                  <path d="M12 16V5m0 0-4 4m4-4 4 4M5 19h14" />
                </svg>
              </span>
              <span className="font-serif text-title">Add a screenshot</span>
              <span className="max-w-[16rem] text-caption text-stone">Drop one here, or tap to choose. TikTok, Instagram, a photo of a friend.</span>
              <input type="file" accept="image/*" className="sr-only" onChange={(e) => onPick(e.target.files?.[0])} />
            </label>
          )}

          {!image && last && (
            <Button variant="ghost" onClick={() => setImage(last.image)}>
              Use my last photo
            </Button>
          )}

          {busy && <Notice>Reading the cut…</Notice>}
          {error && (
            <Notice tone="error">
              {error}{" "}
              {topUpUrl && (
                <a href={topUpUrl} className="underline underline-offset-4" target="_blank" rel="noreferrer">
                  Top up
                </a>
              )}
            </Notice>
          )}
          {image && !result && (
            <Button onClick={analyse} disabled={busy}>
              Decode this cut
            </Button>
          )}
          {result && <Button onClick={tryIt}>Try it on me</Button>}
          {result && !result.mock && (
            <Button variant="ghost" onClick={() => setAdding(true)}>
              Add to my cuts
            </Button>
          )}
          {result && (
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setResult(null);
                void analyse();
              }}
            >
              Decode again
            </Button>
          )}
          {image && (
            <Button variant="ghost" onClick={reset}>
              Start over
            </Button>
          )}
          {image && (
            <label className={`${buttonClass("ghost")} cursor-pointer focus-within:outline-2 focus-within:outline-champagne-light`}>
              Choose another image
              <input type="file" accept="image/*" className="sr-only" onChange={(e) => onPick(e.target.files?.[0])} />
            </label>
          )}
          <p className="text-caption text-stone">The analyzer describes the haircut only. It never rates or comments on anyone&apos;s face.</p>
        </div>

        {result ? (
          <article className="surface surface--grain flex animate-rise flex-col gap-6 rounded-[var(--r-panel)] p-6 lg:p-8">
            {result.mock && <Notice>Demo mode: no AI looked at this image.</Notice>}
            <div className="flex flex-wrap items-start justify-between gap-4">
              <h2 className="font-serif text-headline">{result.cut.styleName}</h2>
              <span className="shrink-0 rounded-full border border-champagne/40 px-4 py-1.5 font-mono text-caption text-champagne capitalize">{result.cut.upkeep} upkeep</span>
            </div>
            <p className="text-lead text-stone">{result.cut.summary}</p>
            <dl className="grid gap-x-8 sm:grid-cols-2">
              {rows.map(({ key, label }) => (
                <div key={key} className="flex flex-col gap-1 border-t border-hairline py-4">
                  <dt className="text-caption tracking-widest text-champagne uppercase">{label}</dt>
                  <dd className="text-body">{result.cut[key]}</dd>
                </div>
              ))}
            </dl>
            {result.cut.askFor.length > 0 && (
              <div className="flex flex-col gap-3 border-t border-hairline pt-6">
                <h3 className="text-caption tracking-widest text-champagne uppercase">Say this to your barber</h3>
                <ul className="flex flex-col gap-2 font-serif text-title">
                  {result.cut.askFor.map((line) => (
                    <li key={line}>&ldquo;{line}&rdquo;</li>
                  ))}
                </ul>
              </div>
            )}
          </article>
        ) : (
          <div className="flex flex-col gap-8">
            {history && history.length > 0 && <RecentDecodes rows={history} onOpen={open} />}
            <HowItWorks />
          </div>
        )}
      </div>
      {result && history && history.length > 1 && <RecentDecodes rows={history.filter((r) => r.id !== currentId)} onOpen={open} compact />}
      {image && result && (
        <AddCutSheet
          open={adding}
          onClose={() => setAdding(false)}
          prefill={{ image, name: result.cut.styleName, description: `${result.cut.summary}${result.cut.askFor[0] ? ` Ask for: ${result.cut.askFor[0]}` : ""}`.slice(0, 280) }}
          onAdded={() => router.push("/discover")}
        />
      )}
    </Page>
  );
}

/** Past decodes, kept on this device. Tap one to see it again without another AI call. */
function RecentDecodes({ rows, onOpen, compact = false }: { rows: StoredDecode[]; onOpen: (r: StoredDecode) => void; compact?: boolean }) {
  const [confirmAll, setConfirmAll] = useState(false);
  if (!rows.length) return null;
  return (
    <section aria-label="Recent decodes" className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="font-serif text-title">Recent</h2>
        {!compact &&
          (confirmAll ? (
            <span className="flex items-center gap-3 text-caption">
              <button
                type="button"
                className="text-ivory underline underline-offset-4"
                onClick={() => {
                  Promise.all(rows.map((r) => localStore.remove("decode", r.id))).then(() => setConfirmAll(false));
                }}
              >
                Delete all
              </button>
              <button type="button" className="text-stone underline underline-offset-4 hover:text-ivory" onClick={() => setConfirmAll(false)}>
                Keep
              </button>
            </span>
          ) : (
            <button type="button" className="text-caption text-stone underline underline-offset-4 hover:text-ivory" onClick={() => setConfirmAll(true)}>
              Clear history
            </button>
          ))}
      </div>
      <ul className="fade-end flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none]">
        {rows.map((r) => (
          <li key={r.id} className="group relative w-28 shrink-0 sm:w-32">
            <button type="button" onClick={() => onOpen(r)} aria-label={`Open ${r.cut.styleName}`} className="flex w-full flex-col gap-1.5 rounded-card text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-champagne-light">
              <BlobImage blob={r.image} alt="" className="aspect-[3/4] border border-hairline group-hover:border-champagne/40" />
              <span className="truncate text-caption text-ivory">{r.mock ? "Demo result" : r.cut.styleName}</span>
            </button>
            <button
              type="button"
              aria-label={`Remove ${r.cut.styleName} from recent`}
              onClick={() => localStore.remove("decode", r.id)}
              className="absolute top-1.5 right-1.5 grid size-8 place-items-center rounded-full border border-ivory/10 bg-onyx/70 text-stone backdrop-blur-sm hover:text-ivory pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-champagne-light"
            >
              <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          </li>
        ))}
      </ul>
      {!compact && <p className="text-caption text-stone">Your last 12 decodes stay on this device only. Tap one to see it again.</p>}
    </section>
  );
}

const DECODE_BACKDROP: Backdrop = {
  tone: "mist",
  dither: true,
  blooms: [
    { name: "peony-bl", className: "top-32 -right-20 w-[22rem] opacity-30 max-xl:hidden", rotate: 160 },
    { name: "bloom-1", className: "-top-8 right-8 w-48 opacity-50", rotate: -15, delay: 2 },
  ],
};

/** What Decode does, as three numbered steps, shown until there is a result. */
function HowItWorks() {
  const steps = [
    ["Add a photo of a cut", "A screenshot, a photo of a friend or a magazine page. Only the hair is looked at."],
    ["Get it in barber's words", "The cut's name, how top, sides and back are done, and how much upkeep it needs."],
    ["Say it, or try it on", "Take the phrases to your barber, or send the cut straight to the studio to see it on you."],
  ];
  return (
    <section aria-label="How Decode works" className="surface surface--grain relative isolate flex flex-col gap-6 overflow-hidden rounded-[var(--r-panel)] p-6 lg:p-8">
      <Bloom name="peony-br" className="absolute -right-16 -bottom-12 -z-10 w-72 opacity-40" rotate={190} flip />
      <h2 className="font-serif text-headline">How it works</h2>
      <ol className="flex flex-col gap-6">
        {steps.map(([title, body], i) => (
          <li key={title} className="flex gap-4">
            <span className="grid size-10 shrink-0 place-items-center rounded-full border border-champagne/50 font-mono text-body text-champagne">{i + 1}</span>
            <span className="flex flex-col gap-1">
              <span className="font-serif text-title">{title}</span>
              <span className="max-w-md text-body text-stone">{body}</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
