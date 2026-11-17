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
import { Skeleton } from "./ui/skeleton";

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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  if (loaded === undefined) return <div className="mx-auto max-w-md px-4 py-6"><Skeleton className="aspect-[4/5]" /></div>;
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
        body: JSON.stringify({ lookName: render.lookName, tweak: render.tweak ?? undefined, notes: notes || undefined }),
      });
      const { brief, mock } = (await response.json()) as { brief: BarberBrief; mock: boolean };
      await localStore.put("briefs", { id: newId(), renderId: render.id, brief, mock, includePhoto: false, createdAt: Date.now() });
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : "Something went wrong. Please try again.");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  if (!saved) {
    return (
      <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 py-6">
        <h1 className="font-serif text-headline">Barber Brief</h1>
        <p className="text-body text-stone">Turn {render!.lookName} into clear instructions to show your barber.</p>
        <label className="flex flex-col gap-2 text-body">
          Anything your barber should know? (optional)
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} rows={3} placeholder="Current length, cowlicks, how long you'll spend styling" className="rounded-card border border-hairline bg-slate px-4 py-3 text-body placeholder:text-stone" />
        </label>
        {error && <Notice tone="error">{error}</Notice>}
        <Button onClick={generate} disabled={busy}>
          {busy ? "Writing…" : "Make my Barber Brief"}
        </Button>
      </div>
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
    <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 py-6">
      {saved.mock && <Notice>Demo mode: no AI wrote this brief. The text is placeholder.</Notice>}
      <article className="flex flex-col gap-3 rounded-card bg-ivory p-4 text-onyx">
        <p className="px-3 text-caption font-semibold tracking-widest text-onyx/60 uppercase">Barber Brief</p>
        <div className="flex items-start gap-3">
          <input aria-label="Style name" value={brief.styleName} onChange={(e) => update({ ...brief, styleName: e.target.value })} className={`${field} font-serif text-headline`} />
          {includePhoto && photo && <BlobImage blob={photo} alt="Your render" className="aspect-square w-20 shrink-0" />}
        </div>
        {briefSections.map(({ key, label }) => (
          <label key={key} className="flex flex-col border-t border-onyx/10 pt-2">
            <span className="px-3 text-caption font-semibold tracking-widest text-onyx/60 uppercase">{label}</span>
            <textarea aria-label={label} value={brief[key]} onChange={(e) => update({ ...brief, [key]: e.target.value })} rows={2} className={field} />
          </label>
        ))}
        <label className="flex flex-col border-t border-onyx/10 pt-2">
          <span className="px-3 text-caption font-semibold tracking-widest text-onyx/60 uppercase">Ask your barber (one per line)</span>
          <textarea aria-label="Ask your barber, one per line" value={brief.askYourBarber.join("\n")} onChange={(e) => update({ ...brief, askYourBarber: e.target.value.split("\n").slice(0, 8) })} rows={3} className={field} />
        </label>
      </article>
      <label className="flex items-center gap-3 text-body">
        <input type="checkbox" checked={includePhoto} disabled={!photo} onChange={(e) => update(brief, e.target.checked)} className="size-4 accent-champagne" />
        Include my photo on the card
      </label>
      <div className="flex gap-2">
        <Button onClick={() => exportPng(false)} disabled={exporting} className="flex-1">
          Share image
        </Button>
        <Button variant="ghost" onClick={() => exportPng(true)} disabled={exporting} className="flex-1">
          Share as story
        </Button>
      </div>
    </div>
  );
}
