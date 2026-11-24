"use client";

import { useSearchParams } from "next/navigation";
import { useRef, useState } from "react";
import { ApiClientError, apiFetch } from "@/lib/api-client";
import { briefSections, type BarberBrief } from "@/lib/brief";
import { briefToPng, shareOrDownload } from "@/lib/brief-image";
import { localStore, newId, type StoredBrief } from "@/lib/local-store";
import { useLocal } from "@/lib/use-local";
import { BlobImage } from "./ui/blob-image";
import { Button } from "./ui/button";
import { EmptyState } from "./ui/empty-state";
import { Notice } from "./ui/notice";
import { useProfile } from "@/lib/profile";
import { Bloom } from "./fx/bloom";
import { HairpinLoader } from "./ui/hairpin-loader";
import { Page, type Backdrop } from "./ui/page";
import { PageHeader } from "./ui/page-header";

const field = "w-full resize-none rounded-card border border-transparent bg-transparent px-3 py-2 text-body text-onyx hover:border-onyx/20 focus:border-onyx/40 focus:outline-none";

export function BriefFlow() {
  const params = useSearchParams();
  const renderId = params.get("render");
  const briefId = params.get("id");
  const loaded = useLocal(async () => {
    const saved = briefId ? await localStore.get("briefs", briefId) : (await localStore.list("briefs")).find((b) => b.renderId === renderId);
    const render = await localStore.get("renders", saved?.renderId ?? renderId ?? "");
    return { saved: saved ?? null, render: render ?? null };
  }, `brief:${renderId}:${briefId}`);

  const [notes, setNotes] = useState("");
  const profile = useProfile();
  // The client's own hair, so the brief is written for it (type, length, colour, thickness as they set them).
  const hairNote = profile
    ? [profile.hairType && `hair type ${profile.hairType.toUpperCase()}`, profile.length && `${profile.length} length now`, profile.color && `${profile.color}`, profile.density && `${profile.density} hair`]
        .filter(Boolean)
        .join(", ")
        .replace(/^(.)/, (c) => `Client's hair: ${c}`)
    : "";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [topUpUrl, setTopUpUrl] = useState<string | null>(null);
  const inFlight = useRef(false);

  if (loaded === undefined) {
    return (
      <div className="mx-auto max-w-md px-4 py-6">
        <div className="relative aspect-[4/5] overflow-hidden rounded-card bg-graphite">
          <HairpinLoader variant="panel" label="Opening your brief" />
        </div>
      </div>
    );
  }
  const { saved, render } = loaded;
  if (!saved && !render) return <EmptyState title="No render found" body="Make a try-on first, then turn it into a Barber Brief." />;

  async function generate() {
    if (!render || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const response = await apiFetch("/api/brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lookName: render.lookName, tweak: render.tweak ?? undefined, notes: [hairNote, notes].filter(Boolean).join(". ").slice(0, 500) || undefined }),
      });
      const { brief, mock } = (await response.json()) as { brief: BarberBrief; mock: boolean };
      await localStore.put("briefs", { id: newId(), renderId: render.id, brief, mock, includePhoto: false, createdAt: Date.now() });
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : "Something went wrong. Please try again.");
      setTopUpUrl(e instanceof ApiClientError ? (e.topUpUrl ?? null) : null);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  if (!saved) {
    return (
      <Page backdrop={BRIEF_BACKDROP}>
        <PageHeader
          eyebrow="Barber Brief"
          as="h1"
          title={
            <>
              Take <em className="accent-word">{render!.lookName}</em> to the chair
            </>
          }
          description="Turn this look into clear instructions to show your barber."
        />
        <div className="grid gap-8 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] lg:items-start lg:gap-12">
          <BlobImage blob={render!.result} alt={`Your try-on: ${render!.lookName}`} className="aspect-[4/5] w-full" />
          <div className="surface surface--grain flex max-w-2xl flex-col gap-6 rounded-[var(--r-panel)] p-6 lg:p-8">
            <label className="flex flex-col gap-3 text-body">
              <span className="font-serif text-title">Anything your barber should know?</span>
              <span className="text-caption text-stone">Optional. Current length, cowlicks, how long you&apos;ll spend styling.</span>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} rows={4} className="rounded-card border border-hairline bg-slate px-4 py-3 text-body placeholder:text-stone focus-visible:outline-2 focus-visible:outline-champagne-light" placeholder="e.g. Cowlick at the crown, I style it in two minutes" />
            </label>
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
            {busy && (
              <div className="relative h-64 overflow-hidden rounded-card border border-hairline">
                <HairpinLoader variant="panel" label="Writing your Barber Brief" steps={["Reading the cut", "Choosing barber terms", "Writing your brief"]} />
              </div>
            )}
            <Button onClick={generate} disabled={busy}>
              {busy ? "Writing…" : "Make my Barber Brief"}
            </Button>
          </div>
        </div>
      </Page>
    );
  }

  return <BriefEditor key={saved.id} saved={saved} photo={render?.result ?? null} />;
}

function BriefEditor({ saved, photo }: { saved: StoredBrief; photo: Blob | null }) {
  const [brief, setBrief] = useState(saved.brief);
  const [includePhoto, setIncludePhoto] = useState(saved.includePhoto);
  const [exporting, setExporting] = useState(false);

  function update(next: BarberBrief, include = includePhoto) {
    setBrief(next);
    setIncludePhoto(include);
    void localStore.put("briefs", { ...saved, brief: next, includePhoto: include });
  }

  async function exportPng(story: boolean) {
    setExporting(true);
    try {
      const png = await briefToPng(brief, { story, photo: includePhoto ? photo : null });
      await shareOrDownload(png, `barber-brief${story ? "-story" : ""}.png`);
    } finally {
      setExporting(false);
    }
  }

  return (
    <Page backdrop={BRIEF_BACKDROP}>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:items-start lg:gap-12 2xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        <aside className="flex flex-col gap-4 lg:sticky lg:top-8">
          {photo && <BlobImage blob={photo} alt="Your try-on" className="aspect-[4/5] w-full" />}
          {saved.mock && <Notice>Demo mode: no AI wrote this brief. The text is placeholder.</Notice>}
          <label className="surface flex cursor-pointer items-center gap-3 rounded-card p-4 text-body has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-champagne-light">
            <input type="checkbox" checked={includePhoto} disabled={!photo} onChange={(e) => update(brief, e.target.checked)} className="size-4 accent-champagne" />
            Include my photo on the card
          </label>
          <div className="flex gap-3">
            <Button onClick={() => exportPng(false)} disabled={exporting} className="flex-1">
              Share image
            </Button>
            <Button variant="ghost" onClick={() => exportPng(true)} disabled={exporting} className="flex-1">
              Share as story
            </Button>
          </div>
          <p className="text-caption text-stone">AI-assisted from the look&apos;s name and your notes. Edit anything before you share it; your barber has the final say on lengths and on what suits you.</p>
        </aside>

        <article className="relative flex flex-col gap-3 overflow-hidden rounded-card bg-ivory p-4 text-onyx shadow-2xl shadow-onyx lg:p-8">
          <Bloom name="peony-tr" className="absolute -top-6 -right-12 w-56 opacity-25 mix-blend-multiply" rotate={-20} float={false} />
          <h1 className="relative px-3 text-caption font-semibold tracking-[0.28em] text-onyx/60 uppercase">Barber Brief</h1>
          <div className="relative flex items-start gap-3">
            <input aria-label="Style name" value={brief.styleName} onChange={(e) => update({ ...brief, styleName: e.target.value })} className={`${field} font-serif text-display`} />
            {includePhoto && photo && <BlobImage blob={photo} alt="Your render" className="aspect-square w-24 shrink-0" />}
          </div>
          <div className="relative grid gap-x-8 xl:grid-cols-2">
            {briefSections.map(({ key, label }) => (
              <label key={key} className="flex flex-col border-t border-onyx/10 pt-3">
                <span className="px-3 text-caption font-semibold tracking-widest text-onyx/60 uppercase">{label}</span>
                <textarea aria-label={label} value={brief[key]} onChange={(e) => update({ ...brief, [key]: e.target.value })} rows={2} className={field} />
              </label>
            ))}
          </div>
          <label className="relative flex flex-col border-t border-onyx/10 pt-3">
            <span className="px-3 text-caption font-semibold tracking-widest text-onyx/60 uppercase">Ask your barber (one per line)</span>
            <textarea aria-label="Ask your barber, one per line" value={brief.askYourBarber.join("\n")} onChange={(e) => update({ ...brief, askYourBarber: e.target.value.split("\n").slice(0, 8) })} rows={3} className={field} />
          </label>
        </article>
      </div>
    </Page>
  );
}

const BRIEF_BACKDROP: Backdrop = {
  tone: "ember",
  dither: false,
  blooms: [{ name: "peony-tr", className: "-top-10 -right-20 w-[24rem] opacity-50", rotate: -20 }],
};
