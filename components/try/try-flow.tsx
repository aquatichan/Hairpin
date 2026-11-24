"use client";

import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { useAiChoice } from "@/lib/ai-choice";
import { useProfile } from "@/lib/profile";
import { ApiClientError } from "@/lib/api-client";
import { takePendingReference, type PendingReference } from "@/lib/handoff";
import { resizeToJpeg } from "@/lib/image";
import { localStore, type StoredRender } from "@/lib/local-store";
import { loadMoreCommunity, resolveCommunity, useCommunity } from "@/lib/community";
import { cutBlob, useMyLooks } from "@/lib/cuts";
import { libraryLooks, type Look } from "@/lib/looks";
import { requestRender } from "@/lib/tryon-client";
import { trackRender } from "@/lib/render-tracker";
import { petalBurst } from "@/lib/fx";
import { CANNOT_RENDER, LIMITS, PROVIDER_CAPABILITY, TWEAKS, referenceAccess, referenceUnsupported, usesReferenceImage, type ProviderKind, type TryonTarget } from "@/lib/tryon-plan";
import { setChoice } from "@/lib/ai-choice";
import { VENDOR_INFO } from "@/lib/ai-vendors";
import { useFreeStatus } from "@/lib/free-status";
import { useBlobUrl, useLocal } from "@/lib/use-local";
import { BeforeAfter } from "../ui/before-after";
import { BlobImage } from "../ui/blob-image";
import { Button, buttonClass } from "../ui/button";
import { Chip } from "../ui/chip";
import { HairpinLoader } from "../ui/hairpin-loader";
import { Notice } from "../ui/notice";
import { Page, type Backdrop } from "../ui/page";
import { PageHeader } from "../ui/page-header";
import { LookPicker } from "./look-picker";
import { PhotoCard, PhotoSetup } from "./photo-setup";

type Source = "library" | "describe" | "screenshot";
type Method = "reference" | "describe";

const PUBLIK_TRIAL = process.env.NEXT_PUBLIC_PUBLIK_REFERENCE_TRIAL === "1";

/** One line on how a render was made, so a description-based result is never mistaken for a reference match. */
function provenance(r: StoredRender) {
  switch (r.mode) {
    case "catalog-reference":
      return `Matched to the reference portrait of ${r.lookName}.`;
    case "catalog-describe":
      return `Made from a written description of ${r.lookName}. The reference portrait was not sent.`;
    case "upload":
      return "Matched to your screenshot.";
    case "text":
      return "Made from your written description.";
    default:
      return null;
  }
}

function steps(target: TryonTarget | null) {
  const middle = target && usesReferenceImage(target.kind) ? "Studying the reference" : "Reading the description";
  return ["Reading your photo", middle, "Cutting", "Styling the finish", "Almost there"];
}

export function TryFlow() {
  const lookParam = useSearchParams().get("look");
  const choice = useAiChoice();
  const profile = useProfile();
  const free = useFreeStatus();
  // Capability follows whoever pays: the person's own provider, the app's free-try-on provider, or publik.
  const provider: ProviderKind = choice?.mode === "own" ? choice.vendor : choice?.mode === "free" ? (free?.vendor ?? "openai") : "publik";
  const freeLeft = choice?.mode === "free" ? (free?.enabled ? free.remaining : 0) : null;
  // Claude can read images but not make them: no try-on is ever offered on an Anthropic key.
  const cannotRender = PROVIDER_CAPABILITY[provider] === "no_image_output";
  const access = referenceAccess(provider, PUBLIK_TRIAL);

  const photo = useLocal(() => localStore.get("photo", "active").then((p) => p ?? null), "photo");
  const photoUrl = useBlobUrl(photo?.blob);

  const mine = useMyLooks();
  const community = useCommunity();
  const initialLook = libraryLooks.find((l) => l.id === lookParam) ?? null;
  const [source, setSource] = useState<Source>("library");
  const [look, setLook] = useState<Look | null>(initialLook);
  const [method, setMethod] = useState<Method>("reference");
  const [description, setDescription] = useState("");
  const [shot, setShot] = useState<PendingReference | null>(null);
  const [picking, setPicking] = useState(false);

  const [session, setSession] = useState<StoredRender[]>([]);
  const [current, setCurrent] = useState<StoredRender | null>(null);
  const [busy, setBusy] = useState<TryonTarget | null>(null);
  const [fresh, setFresh] = useState<string | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<ApiClientError | null>(null);
  const inFlight = useRef(false);
  const currentUrl = useBlobUrl(current?.result);
  const describeId = useId();

  // A shared link to one of the person's own cuts (/try?look=m-...) opens it as the reference once their cuts have loaded.
  const openedMine = useRef(false);
  useEffect(() => {
    if (openedMine.current || !lookParam?.startsWith("m-")) return;
    const own = mine.find((l) => l.id === lookParam);
    if (!own) return;
    openedMine.current = true;
    queueMicrotask(() => pickLook(own));
    // pickLook only sets state.
  }, [mine, lookParam]);

  // Community cuts: the picker needs a first page, and a shared link (/try?look=p-...) is fetched by id.
  useEffect(() => {
    void loadMoreCommunity();
    if (lookParam?.startsWith("p-")) void resolveCommunity([lookParam]);
    // Once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const openedCommunity = useRef(false);
  useEffect(() => {
    if (openedCommunity.current || !lookParam?.startsWith("p-")) return;
    const found = community.all.find((l) => l.id === lookParam);
    if (!found) return;
    openedCommunity.current = true;
    queueMicrotask(() => pickLook(found));
  }, [community.all, lookParam]);

  // Pick up a screenshot handed over from Decode.
  useEffect(() => {
    const handed = takePendingReference();
    if (!handed) return;
    queueMicrotask(() => {
      setShot(handed);
      setSource("screenshot");
    });
  }, []);

  const target: TryonTarget | null =
    source === "library"
      ? look && { kind: method === "reference" ? "catalog-reference" : "catalog-describe", lookId: look.id }
      : source === "screenshot"
        ? shot && { kind: "upload", name: shot.name }
        : description.trim().length >= LIMITS.descriptionMin
          ? { kind: "text", description: description.trim() }
          : null;
  // Until the AI choice has loaded from this device, the capability isn't known; nothing is offered or sent yet.
  const known = choice !== undefined && (choice?.mode !== "free" || free !== null);
  // "Can't make images at all" outranks "won't send the reference": only one explanation is shown.
  const blocked = known && !cannotRender && target !== null && usesReferenceImage(target.kind) && !access.allowed;
  const label = source === "library" ? (look?.name ?? "") : source === "screenshot" ? (shot?.name ?? "Your screenshot") : description.trim().slice(0, LIMITS.nameMax);

  function pickLook(l: Look) {
    // A private cut is used like a screenshot: its photo is the reference, and nothing about it reaches the server by id.
    if (l.source === "mine") {
      const blob = cutBlob(l.id);
      if (!blob) return;
      setShot({ blob, name: l.name, summary: l.notes || null });
      setSource("screenshot");
      setPicking(false);
      setError(null);
      window.history.replaceState(null, "", "/try");
      return;
    }
    setLook(l);
    setSource("library");
    setPicking(false);
    setError(null);
    window.history.replaceState(null, "", `/try?look=${encodeURIComponent(l.id)}`);
  }

  /** The labelled text alternative: the person chooses it; nothing is switched for them. */
  function chooseWrittenAlternative() {
    setError(null);
    if (source === "library") setMethod("describe");
    else {
      setDescription([shot?.name, shot?.summary].filter(Boolean).join(": ").slice(0, LIMITS.descriptionMax));
      setSource("describe");
    }
  }

  async function onScreenshot(file: File | undefined) {
    if (!file) return;
    try {
      setShot({ blob: await resizeToJpeg(file, 1024, 0.85), name: null, summary: null });
      setSource("screenshot");
      setError(null);
    } catch {
      setError(new ApiClientError("That file couldn't be read as an image.", "bad_file"));
    }
  }

  async function render(tweak: string | null) {
    // The ref guards against a double tap starting two paid renders.
    if (!photo || !target || !known || blocked || cannotRender || freeLeft === 0 || inFlight.current) return;
    inFlight.current = true;
    setBusy(target);
    setError(null);
    try {
      let reference: Blob | null = null;
      if (target.kind === "upload" && shot) reference = shot.blob.size > LIMITS.referenceBytes ? await resizeToJpeg(shot.blob, 1024, 0.8) : shot.blob;
      const made = await trackRender(requestRender({ photo: photo.blob, target, reference, label, tweak }));
      const first = session.length === 0;
      setSession((s) => [made, ...s]);
      setCurrent(made);
      setFresh(made.id);
      // The peak of the flow: the first result of a visit gets a burst of petals.
      if (first) requestAnimationFrame(() => stageRef.current && petalBurst(stageRef.current));
    } catch (e) {
      setError(e instanceof ApiClientError ? e : new ApiClientError("Something went wrong. Please try again.", "unknown"));
    } finally {
      inFlight.current = false;
      setBusy(null);
    }
  }

  async function removeRender(r: StoredRender) {
    await localStore.remove("renders", r.id);
    setSession((s) => s.filter((x) => x.id !== r.id));
    setCurrent((c) => (c?.id === r.id ? null : c));
  }

  const stage =
    photo === undefined ? (
      <div className="relative aspect-[4/5] overflow-hidden rounded-card bg-graphite">
        <HairpinLoader variant="panel" label="Opening the studio" />
      </div>
    ) : photo === null ? (
      <PhotoSetup />
    ) : (
      <div className="flex flex-col gap-3">
        <div className="relative overflow-hidden rounded-card">
          {current && photoUrl && currentUrl ? (
            <div key={current.id} className={fresh === current.id ? "reveal-sweep" : ""}>
            <BeforeAfter before={photoUrl} after={currentUrl} label={`Compare your photo and the try-on preview: ${current.lookName}`} beforeLabel="Your photo" afterLabel="Try-on preview" beforeAlt="Your photo" afterAlt={`Try-on preview: ${current.lookName}`} />
            </div>
          ) : (
            <BlobImage blob={photo.blob} alt="Your photo" />
          )}
          {busy && <HairpinLoader variant="panel" label={`Making your try-on: ${label}`} steps={steps(busy)} />}
        </div>
        {busy ? (
          <div className="flex items-center justify-between gap-3 text-caption text-stone">
            {/* The request belongs to this tab: it survives moving around the app, not a reload or closing the tab. */}
            <span>Usually 20 to 60 seconds. You can browse Hairpin meanwhile; keep this tab open, as reloading or closing it stops the try-on.</span>
            <Link href="/discover" className="shrink-0 rounded-full px-3 py-1.5 hover:text-ivory">
              Continue browsing
            </Link>
          </div>
        ) : current ? (
          <div className="flex flex-col gap-1 text-caption text-stone">
            <p>
              {provenance(current)}
              {current.experimental && <span className="ml-2 rounded-full border border-champagne/60 px-2 py-0.5 text-champagne">Experimental: publik reference trial</span>}
            </p>
            <p>An AI preview. Results vary with photo, lighting and hair type.</p>
          </div>
        ) : null}
        {current?.mock && <Notice>Demo mode: this is your original photo, not an AI render.</Notice>}

        {session.length > 1 && (
          <ul className="fade-edges-x flex gap-2 overflow-x-auto px-6 pb-1" aria-label="This session's try-ons">
            {session.map((r) => (
              <li key={r.id} className="w-16 shrink-0">
                <button
                  type="button"
                  onClick={() => setCurrent(r)}
                  aria-label={`Show ${r.lookName}${r.tweak ? `, ${r.tweak}` : ""}`}
                  aria-pressed={current?.id === r.id}
                  className={`block w-full overflow-hidden rounded-card border ${current?.id === r.id ? "border-champagne" : "border-transparent"}`}
                >
                  <BlobImage blob={r.result} alt="" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    );

  return (
    <Page backdrop={TRY_BACKDROP}>
      <PageHeader
        eyebrow="AI Studio"
        title={
          <>
            Try it <em className="accent-word">on you</em>
          </>
        }
        description="Preview a cut on your own photo before the chair."
      />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:items-start lg:gap-12 2xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <section ref={stageRef} aria-label="Preview" className="lg:sticky lg:top-8">
          {stage}
        </section>

        <div className="flex min-w-0 flex-col gap-4">
          {photo && (
            <Panel step="1" title="Photo">
              <PhotoCard photo={photo} onError={(m) => setError(new ApiClientError(m, "bad_file"))} />
            </Panel>
          )}

          <Panel step={photo ? "2" : "1"} title="Hairstyle">
            <fieldset className="flex flex-col gap-4">
              <legend className="sr-only">Where the hairstyle comes from</legend>
              <div className="grid grid-cols-3 gap-1 rounded-full border border-hairline bg-onyx p-1">
                {(
                  [
                    ["library", "Library"],
                    ["describe", "Describe"],
                    ["screenshot", "Screenshot"],
                  ] as const
                ).map(([value, text]) => (
                  <label
                    key={value}
                    className={`flex h-9 cursor-pointer items-center justify-center rounded-full text-body font-medium transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-champagne-light ${
                      source === value ? "bg-ivory text-onyx" : "text-stone hover:text-ivory"
                    }`}
                  >
                    <input type="radio" name="source" value={value} checked={source === value} onChange={() => setSource(value)} className="sr-only" />
                    {text}
                  </label>
                ))}
              </div>

              {source === "library" &&
                (look ? (
                  <div className="flex flex-col gap-4">
                    <div className="flex items-center gap-4">
                      <div className="relative aspect-[3/4] w-20 shrink-0 overflow-hidden rounded-[var(--r-tile)] border border-hairline bg-graphite">
                        <Image src={look.image} alt={look.alt ?? look.name} fill sizes="80px" className="object-cover" />
                      </div>
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <p className="font-serif text-title">{look.name}</p>
                        <p className="text-caption text-champagne capitalize">
                          {look.length} · {look.hairType ? <span className="font-mono normal-case">{look.hairType.toUpperCase()}</span> : look.texture}
                          {profile?.hairType && look.hairType && <span className="text-stone normal-case"> · your hair {profile.hairType.toUpperCase()}</span>}
                        </p>
                        {look.illustrative && <p className="text-caption text-stone">Illustrative AI portrait.</p>}
                      </div>
                      <button type="button" onClick={() => setPicking(true)} className="shrink-0 rounded-full border border-hairline px-4 py-2 text-caption font-medium hover:border-stone/50 hover:bg-graphite">
                        Change
                      </button>
                    </div>

                    <div role="radiogroup" aria-label="How to use this look" className="flex flex-col gap-2">
                      <MethodOption
                        checked={method === "reference"}
                        onChange={() => setMethod("reference")}
                        title="Match the reference portrait"
                        body="Sends your photo and this portrait. Only the hair is copied: shape, length, texture, parting, volume and styling."
                        badge={!known || cannotRender ? undefined : access.allowed ? (access.experimental ? "Experimental" : "Most accurate") : `Not available on ${provider === "publik" ? "publik" : VENDOR_INFO[provider].label} yet`}
                        muted={known && !access.allowed}
                      />
                      <MethodOption
                        checked={method === "describe"}
                        onChange={() => setMethod("describe")}
                        title="Use the written description"
                        body="Sends your photo and a text description of this look. The portrait isn't sent, so the match is looser."
                      />
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-start gap-3">
                    <p className="text-body text-stone">Pick a cut from the library to use as your reference.</p>
                    <Button variant="ghost" onClick={() => setPicking(true)}>
                      Choose a look
                    </Button>
                  </div>
                ))}

              {source === "describe" && (
                <div className="flex flex-col gap-2">
                  <label htmlFor={describeId} className="text-body font-medium">
                    Describe the haircut
                  </label>
                  <textarea
                    id={describeId}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    maxLength={LIMITS.descriptionMax}
                    rows={3}
                    placeholder="e.g. Short textured crop, low skin fade, messy fringe"
                    className="rounded-card border border-hairline bg-slate px-4 py-3 text-body placeholder:text-stone focus-visible:outline-2 focus-visible:outline-champagne-light"
                  />
                  <p className="text-caption text-stone">
                    Only your words and photo are sent. {description.length}/{LIMITS.descriptionMax}
                  </p>
                </div>
              )}

              {source === "screenshot" && (
                <div className="flex flex-col gap-3">
                  {shot ? (
                    <div className="flex items-center gap-4">
                      <BlobImage blob={shot.blob} alt="Your screenshot" className="aspect-[3/4] w-20 shrink-0" />
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <p className="font-serif text-title">{shot.name ?? "Your screenshot"}</p>
                        <p className="text-caption text-stone">Only used for your own try-on. Never published.</p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-body text-stone">Upload a photo of a haircut you like. Only the hair is used.</p>
                  )}
                  <label className={`${buttonClass("ghost")} cursor-pointer focus-within:outline-2 focus-within:outline-champagne-light`}>
                    {shot ? "Replace screenshot" : "Upload a screenshot"}
                    <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => onScreenshot(e.target.files?.[0])} />
                  </label>
                </div>
              )}

              {blocked && (
                <div className="flex flex-col gap-3 rounded-card border border-champagne/40 bg-champagne/5 p-4" role="status">
                  <p className="text-body">{referenceUnsupported(provider)}</p>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="ghost" onClick={chooseWrittenAlternative}>
                      {source === "library" ? "Use the written description" : "Describe it instead"}
                    </Button>
                    <Link href="/you" className={buttonClass("ghost")}>
                      Use a different AI key
                    </Link>
                  </div>
                </div>
              )}
            </fieldset>
          </Panel>

          {current && !busy && (
            <Panel step={photo ? "3" : "2"} title="Fine-tune">
              <div className="flex flex-wrap gap-2" role="group" aria-label="Adjust this cut">
                {TWEAKS.map((t) => (
                  <Chip key={t} selected={current.tweak === t} onClick={() => render(t)}>
                    {t}
                  </Chip>
                ))}
              </div>
              <p className="text-caption text-stone">Each adjustment makes a new try-on.</p>
            </Panel>
          )}

          {error && <ErrorPanel error={error} onRetry={() => render(current?.tweak ?? null)} onAlternative={chooseWrittenAlternative} source={source} />}

          {photo && (
            <div
              className={`flex flex-col gap-2 ${
                // Only the generate button stays pinned above the tab bar on phones; result actions sit in the flow.
                current && !busy ? "max-lg:order-first" : "sticky bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-10 -mx-4 border-t border-hairline bg-onyx/90 px-4 py-3 backdrop-blur-md lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none"
              }`}
            >
              {current && !busy ? (
                <div className="grid grid-cols-2 gap-2">
                  <Link href={`/brief?render=${current.id}`} className={`${buttonClass("primary")} col-span-2`}>
                    Create Barber Brief
                  </Link>
                  <Button variant="ghost" onClick={() => render(current.tweak)} disabled={!target || blocked || freeLeft === 0}>
                    Generate again
                  </Button>
                  <Button variant="ghost" onClick={() => removeRender(current)}>
                    Delete
                  </Button>
                  <p className="col-span-2 text-caption text-stone">
                    Saved privately on this device.{" "}
                    <Link href="/saved" className="underline underline-offset-4 hover:text-ivory">
                      View in Saved
                    </Link>
                  </p>
                </div>
              ) : (
                <>
                  {cannotRender && (
                    <div className="flex flex-col gap-3 rounded-card border border-champagne/40 bg-champagne/5 p-4" role="status">
                      <p className="text-body">{CANNOT_RENDER}</p>
                      <Button variant="ghost" onClick={() => setChoice(null)}>
                        Choose how try-ons run
                      </Button>
                    </div>
                  )}
                  <Button className="h-14 text-lead" onClick={() => render(null)} disabled={!!busy || !target || !known || blocked || cannotRender || freeLeft === 0}>
                    {busy ? "Generating…" : "Generate try-on"}
                  </Button>
                  <p className="text-caption text-stone">
                    {!target
                      ? source === "describe"
                        ? "Describe the haircut to continue."
                        : source === "screenshot"
                          ? "Upload a screenshot to continue."
                          : "Choose a look to continue."
                      : blocked
                        ? "Choose an option above to continue."
                        : cannotRender
                          ? "Your Anthropic key covers Decode and Barber Briefs."
                          : choice?.mode === "own"
                          ? `Billed to your own ${VENDOR_INFO[choice.vendor].label} key.`
                          : freeLeft !== null
                            ? freeLeft > 0
                              ? `Free: ${freeLeft} of ${free?.perIp ?? 3} try-ons left on this connection.`
                              : "Your free try-ons are used up."
                            : "Uses one try-on from your publik plan."}
                  </p>
                  {freeLeft === 0 && (
                    <Button variant="ghost" onClick={() => setChoice(null)}>
                      Choose a plan or your own key
                    </Button>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <LookPicker open={picking} looks={[...mine, ...community.all.filter((l) => !mine.some((m) => m.id === l.id)), ...libraryLooks]} selectedId={look?.id ?? null} onPick={pickLook} onClose={() => setPicking(false)} />
    </Page>
  );
}

const TRY_BACKDROP: Backdrop = {
  tone: "ember",
  dither: true,
  blooms: [
    { name: "bloom-1", className: "-top-6 right-4 w-56 opacity-60", rotate: 20, delay: 2 },
    { name: "petal-5", className: "top-44 right-[38%] hidden w-10 opacity-60 lg:block", rotate: -30, delay: 4 },
  ],
};

function Panel({ step, title, children }: { step: string; title: string; children: React.ReactNode }) {
  return (
    <section className="surface surface--grain flex flex-col gap-4 rounded-[var(--r-panel)] p-4 sm:p-6" aria-label={title}>
      <h2 className="flex items-center gap-3 text-caption tracking-widest text-stone uppercase">
        <span className="grid size-6 place-items-center rounded-full border border-champagne/50 text-champagne">{step}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function MethodOption({ checked, onChange, title, body, badge, muted }: { checked: boolean; onChange: () => void; title: string; body: string; badge?: string; muted?: boolean }) {
  return (
    <label
      className={`press flex cursor-pointer gap-3 rounded-[var(--r-tile)] border p-3 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-champagne-light ${
        checked ? "border-champagne/70 bg-champagne/5" : "border-hairline hover:border-stone/50"
      }`}
    >
      <input type="radio" name="method" checked={checked} onChange={onChange} className="mt-1 size-4 shrink-0 accent-champagne" />
      <span className="flex flex-col gap-1">
        <span className="flex flex-wrap items-center gap-2 text-body font-medium">
          {title}
          {badge && <span className={`rounded-full border px-2 py-0.5 text-caption font-normal ${muted ? "border-hairline text-stone" : "border-champagne/50 text-champagne"}`}>{badge}</span>}
        </span>
        <span className="text-caption text-stone">{body}</span>
      </span>
    </label>
  );
}

function ErrorPanel({ error, onRetry, onAlternative, source }: { error: ApiClientError; onRetry: () => void; onAlternative: () => void; source: Source }) {
  const action = (() => {
    switch (error.code) {
      case "payment_required":
        return error.topUpUrl ? (
          <a href={error.topUpUrl} target="_blank" rel="noreferrer" className={buttonClass("ghost")}>
            Top up
          </a>
        ) : null;
      case "reference_unsupported":
        return (
          <Button variant="ghost" onClick={onAlternative}>
            {source === "library" ? "Use the written description" : "Describe it instead"}
          </Button>
        );
      case "free_used":
      case "free_busy":
      case "free_unavailable":
      case "provider_cannot_render":
        return (
          <Button variant="ghost" onClick={() => setChoice(null)}>
            Choose a plan or your own key
          </Button>
        );
      case "free_tryons_only":
        return null;
      case "own_key_failed":
        return (
          <Link href="/you" className={buttonClass("ghost")}>
            Check my key
          </Link>
        );
      case "signed_out":
        return (
          <Button variant="ghost" onClick={() => window.location.reload()}>
            Sign in again
          </Button>
        );
      case "rate_limited":
      case "render_in_progress":
      case "bad_file":
      case "bad_image":
      case "too_large":
      case "unknown_look":
        return null;
      default:
        return (
          <Button variant="ghost" onClick={onRetry}>
            Try again
          </Button>
        );
    }
  })();
  return (
    <div className="flex flex-col gap-3">
      <Notice tone="error">{error.message}</Notice>
      {action}
    </div>
  );
}
