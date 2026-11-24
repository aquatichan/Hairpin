"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { countCommunitySave, loadMoreCommunity, refreshMine, reportCommunity, unshareCut, useCommunity } from "@/lib/community";
import { cutBlob, getCut, isMyShared, useMyLooks } from "@/lib/cuts";
import { moreLikeThis, type FeedTab, type Ranked } from "@/lib/feed";
import { setPendingReference } from "@/lib/handoff";
import { localStore } from "@/lib/local-store";
import { flyToSaved, sparkle } from "@/lib/fx";
import { FAMILIES, HAIR_TYPE_INFO, hairTypeImage, hairTypeLabel, typesIn, type HairType } from "@/lib/hair-types";
import type { Look } from "@/lib/looks";
import { saveProfile, useProfile } from "@/lib/profile";
import { toggleSavedLook, useSavedLooks } from "@/lib/saved-looks";
import { LOOK_FOR, LOOK_FOR_LABEL, tagLabel, type LookFor } from "@/lib/style";
import { markLooksSeen, recordTaste, unhideLook, useTaste } from "@/lib/taste-store";
import { useFeed } from "./feed/use-feed";
import { MasonryColumns } from "./feed/masonry-columns";
import { Bloom } from "./fx/bloom";
import { Dither } from "./fx/dither";
import { PixelSurface } from "./fx/pixel-surface";
import { AddCutSheet } from "./cuts/add-cut";
import { BoardPicker } from "./saved/board-picker";
import { BeforeAfter } from "./ui/before-after";
import { BottomSheet } from "./ui/bottom-sheet";
import { Button, buttonClass } from "./ui/button";
import { Chip } from "./ui/chip";
import { HairpinLoader } from "./ui/hairpin-loader";
import { ChevronLeftIcon, ChevronRightIcon, CloseIcon, HideIcon, PlusIcon, SavedFilledIcon, SavedIcon, SearchIcon } from "./ui/icons";
import { Page, type Backdrop } from "./ui/page";
import { PageHeader } from "./ui/page-header";

const LENGTHS = ["short", "medium", "long"] as const;
const TEXTURES = ["straight", "wavy", "curly", "coily"] as const;
type Length = (typeof LENGTHS)[number];
type Texture = (typeof TEXTURES)[number];
type Tab = FeedTab | "saved" | "mine";
const TABS: { id: Tab; label: string }[] = [
  { id: "for-you", label: "For you" },
  { id: "new", label: "New" },
  { id: "popular", label: "Popular" },
  { id: "mine", label: "Mine" },
  { id: "saved", label: "Saved" },
];
const PAGE = 30;

const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-champagne-light";

/** The look ID in the address bar, so a look can be linked to and survives reload. */
function readLookParam() {
  return new URLSearchParams(window.location.search).get("look");
}
function writeLookParam(id: string | null) {
  const url = new URL(window.location.href);
  if (id) url.searchParams.set("look", id);
  else url.searchParams.delete("look");
  window.history.replaceState(window.history.state, "", url);
}

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** A library image that reserves its space, shows the blur placeholder, and sharpens in once loaded. */
function LookImage({ look, sizes, priority = false, className = "", tag = false }: { look: Look; sizes: string; priority?: boolean; className?: string; tag?: boolean }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <>
      {!loaded &&
        (look.blur ? (
          // eslint-disable-next-line @next/next/no-img-element -- inline data URL placeholder
          <img aria-hidden src={look.blur} alt="" className="absolute inset-0 size-full scale-110 object-cover blur-xl" />
        ) : (
          <span aria-hidden className="absolute inset-0 animate-pulse bg-slate" />
        ))}
      <Image
        src={look.image}
        alt={look.alt ?? look.name}
        fill
        sizes={sizes}
        priority={priority}
        unoptimized={look.source === "community"}
        data-look={tag ? look.id : undefined}
        onLoad={() => setLoaded(true)}
        className={`object-cover transition-[opacity,transform,filter] duration-500 ease-out ${loaded ? "opacity-100 blur-0" : "opacity-0 blur-sm"} ${className}`}
      />
    </>
  );
}

/** Bookmark that blurs between its two states, and on save sparks and sends the look flying into the Saved tab. */
function SaveButton({ look, saved, variant }: { look: Look; saved: boolean; variant: "card" | "sheet" }) {
  const label = saved ? `Remove ${look.name} from saved` : `Save ${look.name}`;
  const onClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    const el = e.currentTarget;
    toggleSavedLook(look.id);
    if (look.source === "community") countCommunitySave(look.id, !saved);
    if (!saved) {
      recordTaste("save", look);
      sparkle(el);
      flyToSaved(el, look.image);
    }
  };
  const icon = (
    <span className={`icon-swap ${saved ? "text-champagne" : ""}`} aria-hidden>
      <span data-off={saved ? undefined : ""} className="grid">
        <SavedFilledIcon />
      </span>
      <span data-off={saved ? "" : undefined} className="grid">
        <SavedIcon />
      </span>
    </span>
  );
  if (variant === "sheet") {
    return (
      <Button variant="ghost" aria-pressed={saved} aria-label={label} onClick={onClick}>
        {icon}
        {saved ? "Saved" : "Save"}
      </Button>
    );
  }
  return (
    <button
      type="button"
      aria-pressed={saved}
      aria-label={label}
      onClick={onClick}
      // 40px to look at, 48px to hit.
      className={`press absolute top-2 right-2 z-10 grid size-10 place-items-center rounded-full border border-ivory/10 bg-onyx/60 backdrop-blur-sm before:absolute before:-inset-1 before:content-[''] hover:bg-onyx/85 ${
        saved ? "text-champagne" : "text-ivory"
      } ${focusRing}`}
    >
      {icon}
    </button>
  );
}

function Card({
  r,
  saved,
  priority,
  onOpen,
  onHide,
  yourType,
  index,
}: {
  r: Ranked<Look>;
  saved: boolean;
  priority: boolean;
  onOpen: () => void;
  onHide: () => void;
  yourType: boolean;
  index: number;
}) {
  const look = r.item;
  const ref = useRef<HTMLDivElement>(null);
  // Counts as seen once at least half of it has been on screen.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          seenQueue.add(look.id);
          io.disconnect();
        }
      },
      { threshold: 0.5 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [look.id]);

  const reason = look.source === "mine" ? "Mine" : yourType ? "Your type" : r.reasons[0];
  return (
    <div ref={ref} className="stagger-in group relative" style={{ "--i": Math.min(index, 12) } as React.CSSProperties}>
      <PixelSurface className="rounded-card" gap={14}>
        <button
          type="button"
          onClick={onOpen}
          aria-label={`${look.name}, ${look.length}, ${look.hairType ? `type ${hairTypeLabel(look.hairType)}` : look.texture}. Open details`}
          data-tilt="4"
          className={`relative block w-full overflow-hidden rounded-card border border-hairline bg-graphite text-left hover:border-champagne/40 ${focusRing}`}
          style={{ aspectRatio: `1 / ${look.ratio}` }}
        >
          <LookImage
            look={look}
            priority={priority}
            tag
            sizes="(min-width: 1700px) 16vw, (min-width: 1250px) 20vw, (min-width: 900px) 25vw, (min-width: 600px) 33vw, 50vw"
            className="group-hover:scale-[1.03]"
          />
          <span aria-hidden className="absolute inset-x-0 bottom-0 h-1/2 bg-linear-to-t/oklch from-onyx/90 via-onyx/40 to-transparent" />
          <span aria-hidden className="absolute inset-x-0 bottom-0 flex flex-col gap-1 p-2.5 sm:p-3">
            <span className="font-serif text-lead leading-tight text-ivory lg:text-title">{look.name}</span>
            <span className="text-caption tracking-wider text-champagne uppercase">
              {look.length} · {look.hairType ? <span className="font-mono">{hairTypeLabel(look.hairType)}</span> : look.texture}
            </span>
          </span>
          {reason && (
            <span
              className={`absolute top-3 left-3 max-w-[calc(100%-4.5rem)] truncate rounded-full px-3 py-1 text-caption font-medium shadow-lg shadow-onyx/50 ${
                yourType ? "bg-linear-to-b/oklch from-champagne-light to-champagne text-onyx" : "border border-ivory/10 bg-onyx/70 text-ivory backdrop-blur-sm"
              }`}
            >
              {reason}
            </span>
          )}
        </button>
        <SaveButton look={look} saved={saved} variant="card" />
        <button
          type="button"
          onClick={onHide}
          aria-label={`Not for me: hide ${look.name}`}
          title="Not for me"
          className={`press absolute right-2 bottom-2 z-10 grid size-10 place-items-center rounded-full border border-ivory/10 bg-onyx/60 text-stone backdrop-blur-sm transition-opacity before:absolute before:-inset-1 before:content-[''] hover:bg-onyx/85 hover:text-ivory focus-visible:opacity-100 pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 ${focusRing}`}
        >
          <HideIcon />
        </button>
      </PixelSurface>
    </div>
  );
}

/** Looks scrolled past this session, written in batches so the feed never re-sorts while someone scrolls. */
const seenQueue = new Set<string>();
function flushSeen() {
  if (!seenQueue.size) return;
  markLooksSeen([...seenQueue]);
  seenQueue.clear();
}

/** Where a cut the person added stands: private, or in the review queue, live, or declined. */
function sharedLabel(shared: { postId: string; status: "pending" | "approved" | "rejected" } | null | undefined) {
  if (!shared) return "Private: only on this device.";
  if (shared.status === "approved") return "Shared publicly. Other members can see it.";
  if (shared.status === "rejected") return "Not approved for the public library. It's still yours, privately.";
  return "Waiting for review before it's shown to others.";
}

/** "Report": flags a community cut for review. Three different people reporting takes it down until it's checked. */
function ReportCut({ lookId }: { lookId: string }) {
  const [state, setState] = useState<"idle" | "confirm" | "sending" | "done" | string>("idle");
  if (state === "done") return <p className="text-caption text-stone">Thanks. We&apos;ll take a look.</p>;
  if (state === "confirm" || state === "sending")
    return (
      <div className="flex flex-wrap items-center gap-3 text-caption text-stone">
        <span>Report this cut as inappropriate?</span>
        <button
          type="button"
          disabled={state === "sending"}
          className="text-ivory underline underline-offset-4"
          onClick={async () => {
            setState("sending");
            const err = await reportCommunity(lookId);
            setState(err ?? "done");
          }}
        >
          Report
        </button>
        <button type="button" className="underline underline-offset-4 hover:text-ivory" onClick={() => setState("idle")}>
          Cancel
        </button>
      </div>
    );
  return (
    <div className="flex flex-wrap items-center gap-3 text-caption text-stone">
      <button type="button" className="underline underline-offset-4 hover:text-ivory" onClick={() => setState("confirm")}>
        Report
      </button>
      {state !== "idle" && <span role="alert">{state}</span>}
    </div>
  );
}

/** The look's hair type next to the person's own, as information only: suitability is the barber's call. */
function TypeCompare({ lookType }: { lookType: HairType }) {
  const profile = useProfile();
  const mine = profile?.hairType ?? null;
  return (
    <div className="surface-raised flex items-center gap-4 rounded-[var(--r-tile)] p-3">
      <span className="relative size-14 shrink-0 overflow-hidden rounded-[calc(var(--r-tile)-0.75rem)]">
        <Image src={hairTypeImage(lookType)} alt="" fill sizes="56px" className="object-cover" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-body">
          <span className="font-mono text-champagne">{hairTypeLabel(lookType)}</span> · {HAIR_TYPE_INFO[lookType].name}
        </span>
        <span className="text-caption text-stone">
          {mine ? (
            mine === lookType ? (
              "Same type as your hair."
            ) : (
              `Your hair is ${hairTypeLabel(mine)}.`
            )
          ) : (
            <Link href="/you#hair" className="underline underline-offset-4 hover:text-ivory">
              Add your hair type
            </Link>
          )}
        </span>
      </span>
    </div>
  );
}

function FilterRow<T extends string>({
  label,
  options,
  value,
  onChange,
  render = (o) => o,
  mono = false,
}: {
  label: string;
  options: readonly T[];
  value: T | null;
  onChange: (v: T | null) => void;
  render?: (o: T) => string;
  mono?: boolean;
}) {
  return (
    <div role="group" aria-label={label} className="flex min-w-0 items-center gap-2">
      <span className="w-16 shrink-0 text-caption tracking-widest text-stone uppercase">{label}</span>
      <div className="fade-end -my-1 flex min-w-0 gap-2 overflow-x-auto py-1 [scrollbar-width:none]">
        <Chip selected={value === null} onClick={() => onChange(null)}>
          All
        </Chip>
        {options.map((o) => (
          <Chip key={o} selected={value === o} onClick={() => onChange(value === o ? null : o)}>
            <span className={mono ? "font-mono" : "capitalize"}>{render(o)}</span>
          </Chip>
        ))}
      </div>
    </div>
  );
}

function LookSheet({
  look,
  reasons,
  similar,
  saved,
  tryHref,
  onClose,
  onStep,
  onOpen,
  onHide,
  onTryMine,
  onDelete,
  position,
}: {
  look: Look | null;
  reasons: string[];
  similar: Look[];
  saved: boolean;
  tryHref: string;
  onClose: () => void;
  onStep: ((dir: -1 | 1) => void) | null;
  onOpen: (id: string) => void;
  onHide: (look: Look) => void;
  onTryMine: (look: Look) => void;
  onDelete: (look: Look) => void | Promise<void>;
  position: string;
}) {
  const [view, setView] = useState<"look" | "compare">("look");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const hasPair = Boolean(look?.before);
  const showCompare = hasPair && view === "compare";

  return (
    <BottomSheet open={look !== null} onClose={onClose} label={look?.name ?? "Look"} labelledBy="look-title" size="wide">
      {look && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            {hasPair ? (
              <div role="group" aria-label="Image view" className="flex gap-2">
                <Chip selected={view === "look"} onClick={() => setView("look")}>
                  The look
                </Chip>
                <Chip selected={view === "compare"} onClick={() => setView("compare")}>
                  Before &amp; after
                </Chip>
              </div>
            ) : (
              <span />
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className={`grid size-10 shrink-0 place-items-center rounded-full text-stone transition-colors hover:bg-slate hover:text-ivory ${focusRing}`}
            >
              <CloseIcon />
            </button>
          </div>

          <div className="flex flex-col gap-5 md:grid md:grid-cols-2 md:gap-8">
            <div className="flex flex-col gap-3">
              {showCompare ? (
                <BeforeAfter
                  before={look.before!}
                  after={look.image}
                  label={`Compare the example before and after for ${look.name}`}
                  beforeAlt={`The same model before the ${look.name.toLowerCase()}`}
                  afterAlt={look.alt ?? look.name}
                />
              ) : (
                <div className="relative overflow-hidden rounded-card bg-slate" style={{ aspectRatio: `1 / ${Math.min(Math.max(look.ratio, 1), 1.4)}` }}>
                  <LookImage key={look.id} look={look} sizes="(min-width: 768px) 460px, 100vw" priority />
                </div>
              )}
              {look.illustrative && (
                <p className="text-caption text-stone">
                  {showCompare
                    ? "Illustrative example: two AI-generated portraits of the same model. This is not a Hairpin try-on result."
                    : "Illustrative image, used as a style reference."}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-5">
              <div className="flex flex-col gap-2">
                <p className="text-caption tracking-widest text-champagne uppercase">
                  {look.length} · {look.texture}
                  {look.audience !== "any" && ` · ${look.audience === "men" ? "men's" : "women's"}`}
                </p>
                <h2 id="look-title" className="font-serif text-headline">
                  {look.name}
                </h2>
                {look.tags.length > 0 && (
                  <ul aria-label="Style tags" className="flex flex-wrap gap-1.5 pt-1">
                    {look.tags.map((t) => (
                      <li key={t} className="rounded-full border border-hairline px-2.5 py-0.5 text-caption text-stone">
                        {tagLabel(t)}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {reasons.length > 0 && (
                <p className="text-caption text-stone">
                  <span className="text-champagne">Why you&apos;re seeing this:</span> {reasons.join(" · ")}
                </p>
              )}

              {look.hairType && <TypeCompare lookType={look.hairType} />}

              {look.notes && (
                <section className="flex flex-col gap-2 border-t border-hairline pt-4">
                  <h3 className="text-caption tracking-widest text-stone uppercase">Ask your barber for</h3>
                  <p className="text-lead text-ivory/90">{look.notes}</p>
                </section>
              )}

              {look.credit && (
                <p className="text-caption text-stone">
                  Photo:{" "}
                  {look.creditUrl ? (
                    <a href={look.creditUrl} target="_blank" rel="noreferrer" className="underline underline-offset-4 hover:text-ivory">
                      {look.credit}
                    </a>
                  ) : (
                    look.credit
                  )}
                </p>
              )}

              <details className="group border-t border-hairline pt-4">
                <summary className={`flex cursor-pointer list-none items-center justify-between gap-3 rounded-card text-body font-medium [&::-webkit-details-marker]:hidden ${focusRing}`}>
                  Add to a board
                  <span aria-hidden className="text-stone transition-transform group-open:rotate-45">
                    +
                  </span>
                </summary>
                <div className="pt-3">
                  <BoardPicker lookId={look.id} lookName={look.name} />
                </div>
              </details>

              <p className="text-caption text-stone">Try uses the photo you add in Try. It&apos;s sent to the AI provider only when you start a try-on.</p>

              {/* On phones the actions stay pinned to the bottom of the sheet while the details scroll. */}
              <div className="sticky bottom-0 -mx-4 mt-auto flex flex-col gap-3 border-t border-hairline bg-graphite/95 px-4 pt-3 pb-1 backdrop-blur-sm md:static md:mx-0 md:border-t-0 md:bg-transparent md:px-0 md:pt-0 md:backdrop-blur-none">
                <div className="flex gap-2">
                  {look.source === "mine" ? (
                    <button type="button" onClick={() => onTryMine(look)} className={`${buttonClass("primary")} flex-1`}>
                      Try this look
                    </button>
                  ) : (
                    <Link
                      href={tryHref}
                      onClick={() => {
                        recordTaste("try", look);
                        onClose();
                      }}
                      className={`${buttonClass("primary")} flex-1`}
                    >
                      Try this look
                    </Link>
                  )}
                  <SaveButton look={look} saved={saved} variant="sheet" />
                </div>
                <div className="flex items-center justify-between">
                  {onStep ? (
                    <button type="button" onClick={() => onStep(-1)} className={`flex items-center gap-1 rounded-full py-2 pr-3 text-body text-stone hover:text-ivory ${focusRing}`}>
                      <ChevronLeftIcon />
                      Previous
                    </button>
                  ) : (
                    <span />
                  )}
                  <button type="button" onClick={() => onHide(look)} className={`flex items-center gap-2 rounded-full px-3 py-2 text-caption text-stone hover:text-ivory ${focusRing}`}>
                    <HideIcon />
                    Not for me
                  </button>
                  {onStep ? (
                    <button type="button" onClick={() => onStep(1)} className={`flex items-center gap-1 rounded-full py-2 pl-3 text-body text-stone hover:text-ivory ${focusRing}`}>
                      Next
                      <ChevronRightIcon />
                    </button>
                  ) : (
                    <span />
                  )}
                </div>
                {look.source === "community" && <ReportCut lookId={look.id} />}
                {look.source === "mine" && (
                  <div className="flex flex-wrap items-center gap-3 text-caption text-stone">
                    <span>{sharedLabel(getCut(look.id)?.shared)}</span>
                    {confirmDelete ? (
                      <span className="flex items-center gap-3">
                        <button type="button" className="text-ivory underline underline-offset-4" onClick={() => onDelete(look)}>
                          {getCut(look.id)?.shared ? "Delete, including the public copy" : "Delete this cut"}
                        </button>
                        <button type="button" className="underline underline-offset-4 hover:text-ivory" onClick={() => setConfirmDelete(false)}>
                          Keep
                        </button>
                      </span>
                    ) : (
                      <button type="button" className="underline underline-offset-4 hover:text-ivory" onClick={() => setConfirmDelete(true)}>
                        Delete
                      </button>
                    )}
                  </div>
                )}
                {position && <p className="sr-only">{position}</p>}
              </div>
            </div>
          </div>

          {similar.length > 0 && (
            <section aria-labelledby="more-like-this" className="flex flex-col gap-3 border-t border-hairline pt-4">
              <h3 id="more-like-this" className="font-serif text-title">
                More like this
              </h3>
              <ul className="fade-edges-x -mx-1 flex gap-3 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
                {similar.map((s) => (
                  <li key={s.id} className="w-32 shrink-0 sm:w-36">
                    <button type="button" onClick={() => onOpen(s.id)} className={`group flex w-full flex-col gap-1.5 rounded-card text-left ${focusRing}`}>
                      <span className="relative block aspect-[3/4] overflow-hidden rounded-card border border-hairline bg-slate group-hover:border-champagne/40">
                        <LookImage look={s} sizes="144px" className="group-hover:scale-[1.04]" />
                      </span>
                      <span className="truncate text-caption text-ivory">{s.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </BottomSheet>
  );
}

/** The "Show me" switch, right on Discover: changing it re-ranks the feed behind the loading moment. */
function ShowMe({ value }: { value: LookFor | null }) {
  return (
    <div role="group" aria-label="Show me" className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
      <span className="text-caption tracking-widest text-stone uppercase">Show me</span>
      <div className="flex flex-wrap gap-1.5">
        {LOOK_FOR.map((v) => (
          <Chip key={v} selected={(value ?? "both") === v} onClick={() => saveProfile({ lookFor: v })}>
            {LOOK_FOR_LABEL[v]}
          </Chip>
        ))}
      </div>
    </div>
  );
}

/**
 * The refresh moment after "Show me", hair type, length or face shape changes: the loading screen stays while the new
 * top of the feed actually loads (at least a beat, never more than 1.8 s, tap or Escape to skip).
 */
function RefreshMoment({ grid, onDone }: { grid: React.RefObject<HTMLDivElement | null>; onDone: () => void }) {
  useEffect(() => {
    const started = Date.now();
    const tick = window.setInterval(() => {
      const imgs = Array.from(grid.current?.querySelectorAll<HTMLImageElement>("img[data-look]") ?? []).slice(0, 12);
      const ready = imgs.length > 0 && imgs.every((i) => i.complete);
      const t = Date.now() - started;
      if ((ready && t >= 600) || t >= 1800) onDone();
    }, 100);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onDone();
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearInterval(tick);
      window.removeEventListener("keydown", onKey);
    };
  }, [grid, onDone]);
  return (
    <button type="button" onClick={onDone} aria-label="Skip" className="pop-in fixed inset-0 z-50 block cursor-pointer bg-onyx text-left">
      <HairpinLoader label="Refreshing your feed" steps={["Reading your profile", "Re-ranking cuts", "Picking for you"]} stepEvery={600} />
    </button>
  );
}

export function Masonry({ looks: curated }: { looks: Look[] }) {
  const router = useRouter();
  const mine = useMyLooks();
  // The curated catalog plus this account's own cuts (kept on this device).
  const community = useCommunity();
  // `mine` is a dependency because the set of cuts this device shared (isMyShared) changes together with it.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const others = useMemo(() => community.all.filter((l) => !isMyShared(l.id)), [community.all, mine]);
  const looks = useMemo(() => [...mine, ...others, ...curated], [mine, others, curated]);
  const [adding, setAdding] = useState(false);
  const profile = useProfile();
  const savedIds = useSavedLooks();
  const taste = useTaste();
  const [tab, setTab] = useState<Tab>("for-you");
  const [length, setLength] = useState<Length | null>(null);
  const [texture, setTexture] = useState<Texture | null>(null);
  const [hairType, setHairType] = useState<HairType | null>(null);
  const [tag, setTag] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [showOther, setShowOther] = useState(false);
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [limit, setLimit] = useState(PAGE);
  const [undo, setUndo] = useState<Look | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const feedTab: FeedTab = tab === "saved" || tab === "mine" ? "for-you" : tab;
  const { ranked, ctx, changed, clearChanged } = useFeed(looks, feedTab, showOther);

  // The community feed: first page on arrival, more as the person scrolls.
  useEffect(() => {
    void loadMoreCommunity();
  }, []);

  // Open the look named in the address bar (a shared link, or a reload with the sheet open).
  useEffect(() => {
    const id = readLookParam();
    if (id && looks.some((l) => l.id === id)) queueMicrotask(() => setOpenId(id));
  }, [looks]);

  // Seen looks are written when the page is hidden and every few seconds.
  useEffect(() => {
    const id = window.setInterval(flushSeen, 5000);
    const onHide = () => document.visibilityState === "hidden" && flushSeen();
    document.addEventListener("visibilitychange", onHide);
    return () => {
      flushSeen();
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, []);

  const saved = useMemo(() => new Set(savedIds ?? []), [savedIds]);
  const byId = useMemo(() => new Map(looks.map((l) => [l.id, l])), [looks]);

  const open = useCallback(
    (id: string | null) => {
      setOpenId(id);
      writeLookParam(id);
      const l = id ? byId.get(id) : null;
      if (l) recordTaste("open", l);
    },
    [byId],
  );

  const hide = useCallback(
    (look: Look) => {
      recordTaste("hide", look);
      setUndo(look);
      if (openId === look.id) open(null);
    },
    [openId, open],
  );

  /** A private cut is tried through the same in-memory reference hand-off Decode uses: nothing is uploaded until Generate. */
  const tryMine = (look: Look) => {
    const blob = cutBlob(look.id);
    if (!blob) return;
    recordTaste("try", look);
    setPendingReference({ blob, name: look.name, summary: look.notes || null });
    open(null);
    router.push(profile && profile.onboardedAt === null ? `/welcome?next=${encodeURIComponent("/try")}` : "/try");
  };
  const deleteMine = async (look: Look) => {
    const cut = getCut(look.id);
    // A cut that was shared comes down from the public library too; if that can't be reached, keep it so nothing is orphaned.
    if (cut?.shared && !(await unshareCut(cut))) {
      setNote("Couldn't remove it from the public library right now, so it was kept. Try again when you're online.");
      return;
    }
    open(null);
    void localStore.remove("cuts", look.id);
  };

  const tryHref = (look: Look) => {
    const target = `/try?look=${encodeURIComponent(look.id)}`;
    // The first time someone goes to try a look, the short intro runs first.
    return profile && profile.onboardedAt === null ? `/welcome?next=${encodeURIComponent(target)}` : target;
  };

  const shown = useMemo(() => {
    if (!ranked) return null;
    const q = query.trim().toLowerCase();
    const base =
      tab === "mine"
        ? // Mine: everything the person added, newest first, whatever "Show me" says.
          mine.map((l) => ({ item: l, score: 0, parts: {}, reasons: [], explore: false }))
        : tab === "saved"
        ? // Saved: newest first, straight from the library.
          (savedIds ?? []).flatMap((id) => {
            const r = ranked.find((x) => x.item.id === id);
            const l = byId.get(id);
            return r ? [r] : l ? [{ item: l, score: 0, parts: {}, reasons: [], explore: false }] : [];
          })
        : ranked;
    return base.filter(({ item: l }) => {
      return (
        (!length || l.length === length) &&
        (!texture || l.texture === texture) &&
        (!hairType || l.hairType === hairType) &&
        (!tag || l.tags.includes(tag as never)) &&
        (!q || `${l.name} ${l.length} ${l.texture} ${l.notes} ${l.tags.join(" ")}`.toLowerCase().includes(q))
      );
    });
  }, [ranked, tab, mine, savedIds, byId, length, texture, hairType, tag, query]);

  // The tags most present in this feed, for the quick chip row.
  const topTags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of ranked ?? []) for (const t of r.item.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 14).map(([t]) => t);
  }, [ranked]);

  // Infinite scroll: render a page at a time.
  const sentinel = useRef<HTMLDivElement>(null);
  const total = shown?.length ?? 0;
  const moreCommunity = community.next !== null && tab !== "mine" && tab !== "saved";
  useEffect(() => {
    const el = sentinel.current;
    if (!el || (limit >= total && !moreCommunity)) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        if (limit < total) setLimit((n) => n + PAGE);
        else void loadMoreCommunity();
      },
      { rootMargin: "800px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [limit, total, moreCommunity]);

  // The refresh moment waits on the new order's first images.
  const grid = useRef<HTMLDivElement>(null);
  const refreshing = changed && !reducedMotion();
  const endRefresh = clearChanged;
  useEffect(() => {
    if (changed && reducedMotion()) clearChanged();
  }, [changed, clearChanged]);

  const filtered = Boolean(length || texture || hairType || tag || query.trim());
  const clear = () => {
    setLength(null);
    setTexture(null);
    setHairType(null);
    setTag(null);
    setQuery("");
  };

  const openLook = openId ? (byId.get(openId) ?? null) : null;
  const index = openLook && shown ? shown.findIndex((r) => r.item.id === openLook.id) : -1;
  const step = shown && shown.length > 1 && index >= 0 ? (dir: -1 | 1) => open(shown[(index + dir + shown.length) % shown.length].item.id) : null;
  const openReasons = openLook ? (ranked?.find((r) => r.item.id === openLook.id)?.reasons ?? []) : [];
  const similar = useMemo(() => (openLook && ctx ? moreLikeThis(openLook, looks, ctx, 8) : []), [openLook, looks, ctx]);

  const hiddenCount = Object.keys(taste?.hidden ?? {}).length;
  const page = shown?.slice(0, limit) ?? [];
  const decodeAt = page.length >= 4 ? Math.min(7, page.length) : -1;

  if (looks.length === 0) {
    return (
      <div className="flex flex-col gap-4 px-2 py-4 lg:px-8 lg:py-6">
        <LibraryComingSoon />
      </div>
    );
  }

  return (
    <Page backdrop={DISCOVER_BACKDROP}>
      <PageHeader
        eyebrow="The library"
        title={
          <>
            Discover <em className="accent-word">cuts</em> worth wearing
          </>
        }
        description="A feed that learns from your hair, your face shape and what you save. Open a cut to see how it's done, save it, or try it on your photo."
      />

      <div className="surface surface--grain flex flex-col gap-4 rounded-[var(--r-panel)] p-4 lg:p-6">
        <div className="flex flex-wrap items-center gap-3">
          <div role="group" aria-label="Feed" className="flex gap-1 rounded-full border border-hairline bg-onyx/40 p-1">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                aria-pressed={tab === t.id}
                onClick={() => {
                  setTab(t.id);
                  setLimit(PAGE);
                  if (t.id === "mine") void refreshMine();
                }}
                className={`press h-9 rounded-full px-4 text-body font-medium transition-colors ${focusRing} ${
                  tab === t.id ? "bg-linear-to-b/oklch from-champagne-light to-champagne text-onyx" : "text-stone hover:text-ivory"
                }`}
              >
                {t.label}
                {t.id === "saved" && savedIds && savedIds.length > 0 && <span className={`ml-1.5 ${tab === "saved" ? "text-onyx/70" : "text-champagne"}`}>{savedIds.length}</span>}
              </button>
            ))}
          </div>
          <label className="flex h-11 min-w-0 flex-1 items-center gap-3 rounded-full border border-hairline bg-graphite px-4 text-stone focus-within:border-stone/60 focus-within:text-ivory sm:min-w-56 md:max-w-80">
            <SearchIcon />
            <span className="sr-only">Search looks</span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search cuts, tags, words"
              className="h-full min-w-0 flex-1 bg-transparent text-body text-ivory placeholder:text-stone focus:outline-none"
            />
          </label>
          <Chip selected={filtersOpen || Boolean(length || texture || hairType)} onClick={() => setFiltersOpen((v) => !v)}>
            Filters
          </Chip>
          <button
            type="button"
            onClick={() => setAdding(true)}
            className={`press flex h-9 shrink-0 items-center gap-2 rounded-full border border-champagne/50 px-4 text-body font-medium text-champagne hover:bg-champagne/10 ${focusRing}`}
          >
            <PlusIcon />
            Add a cut
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <ShowMe value={profile?.lookFor ?? null} />
          {profile?.lookFor && profile.lookFor !== "both" && (
            <label className="flex cursor-pointer items-center gap-2 text-caption text-stone">
              <input type="checkbox" checked={showOther} onChange={(e) => setShowOther(e.target.checked)} className="size-4 accent-champagne" />
              Include {profile.lookFor === "men" ? "women's" : "men's"} cuts lower down
            </label>
          )}
        </div>

        <div role="group" aria-label="Tags" className="fade-end -my-1 flex min-w-0 gap-2 overflow-x-auto py-1 [scrollbar-width:none]">
          <Chip selected={tag === null} onClick={() => setTag(null)}>
            All
          </Chip>
          {topTags.map((t) => (
            <Chip key={t} selected={tag === t} onClick={() => setTag(tag === t ? null : t)}>
              {tagLabel(t)}
            </Chip>
          ))}
        </div>

        {filtersOpen && (
          <div className="stagger-in flex flex-col gap-3 border-t border-hairline pt-4">
            <FilterRow label="Length" options={LENGTHS} value={length} onChange={setLength} />
            <FilterRow
              label="Hair"
              options={TEXTURES}
              value={texture}
              onChange={(t) => {
                setTexture(t);
                setHairType(null);
              }}
              render={(t) => `${t} ${FAMILIES.find((f) => f.texture === t)!.id}`}
            />
            {texture && (
              // Only the chosen family's three patterns: fewer choices at a time.
              <FilterRow key={texture} label="Type" options={typesIn(FAMILIES.find((f) => f.texture === texture)!.id)} value={hairType} onChange={setHairType} render={(t) => hairTypeLabel(t)} mono />
            )}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-hairline pb-3">
        <p role="status" className="font-mono text-body text-stone">
          {shown === null ? "Loading looks" : `${shown.length} ${shown.length === 1 ? "look" : "looks"}`}
          {tab === "for-you" && !filtered && shown && shown.length > 0 && (
            <>
              {" "}
              · ranked for you{" "}
              <Link href="/you" className="underline underline-offset-4 hover:text-ivory">
                tune it
              </Link>
            </>
          )}
          {hiddenCount > 0 && tab !== "saved" && <> · {hiddenCount} hidden</>}
        </p>
        {looks.some((l) => l.illustrative) && <p className="text-caption text-stone">Portraits are illustrative images, not customer results.</p>}
      </div>

      <div ref={grid} className="relative">
        {refreshing && <RefreshMoment grid={grid} onDone={endRefresh} />}
        {shown === null ? (
          <SkeletonGrid />
        ) : shown.length > 0 ? (
          <MasonryColumns
            label="Looks"
            items={decodeAt < 0 ? page : [...page.slice(0, decodeAt), null, ...page.slice(decodeAt)]}
            ratio={(r) => (r ? r.item.ratio : 0.9)}
            getKey={(r) => (r ? r.item.id : "decode-tile")}
            render={(r, i) =>
              r ? (
                <Card
                  r={r}
                  saved={saved.has(r.item.id)}
                  priority={i < 4}
                  onOpen={() => open(r.item.id)}
                  onHide={() => hide(r.item)}
                  yourType={Boolean(profile?.hairType && r.item.hairType === profile.hairType)}
                  index={i}
                />
              ) : (
                <DecodeTile />
              )
            }
          />
        ) : (
          <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-hairline px-6 py-16 text-center">
            <h2 className="font-serif text-title">{tab === "mine" && !mine.length ? "Add your first cut" : tab === "saved" && !saved.size ? "No saved looks yet" : "No looks match"}</h2>
            <p className="max-w-sm text-body text-stone">
              {tab === "mine" && !mine.length
                ? "Add a photo of a cut you love. It stays private on this device, and you can try it on yourself."
                : tab === "saved" && !saved.size
                  ? "Tap the bookmark on any look to keep it here."
                  : "Try a different tag, length or texture, or clear the filters."}
            </p>
            {tab === "mine" && !mine.length ? (
              <Button onClick={() => setAdding(true)}>Add a cut</Button>
            ) : (
              <Button variant="ghost" onClick={tab === "saved" && !saved.size ? () => setTab("for-you") : clear}>
                {tab === "saved" && !saved.size ? "Back to For you" : "Clear filters"}
              </Button>
            )}
          </div>
        )}
        {shown && (limit < shown.length || moreCommunity) && <div ref={sentinel} aria-hidden className="h-px" />}
      </div>

      {undo && <UndoHide look={undo} onDone={() => setUndo(null)} />}
      {note && (
        <p role="alert" className="pop-in fixed inset-x-4 bottom-24 z-40 mx-auto max-w-md rounded-card border border-hairline bg-graphite/95 p-4 text-body shadow-2xl shadow-onyx backdrop-blur lg:bottom-8">
          {note}{" "}
          <button type="button" className="underline underline-offset-4" onClick={() => setNote(null)}>
            Dismiss
          </button>
        </p>
      )}

      <LookSheet
        key={openLook?.id ?? "none"}
        look={openLook}
        reasons={openReasons}
        similar={similar}
        saved={openLook ? saved.has(openLook.id) : false}
        tryHref={openLook ? tryHref(openLook) : "/try"}
        onClose={() => open(null)}
        onStep={step}
        onOpen={open}
        onHide={hide}
        onTryMine={tryMine}
        onDelete={deleteMine}
        position={index >= 0 && shown ? `${index + 1} of ${shown.length}` : ""}
      />
      <AddCutSheet
        open={adding}
        onClose={() => setAdding(false)}
        onAdded={() => {
          setTab("mine");
          setLimit(PAGE);
        }}
      />
    </Page>
  );
}

/** "Hidden. Undo" for a few seconds after "Not for me". */
function UndoHide({ look, onDone }: { look: Look; onDone: () => void }) {
  useEffect(() => {
    const id = window.setTimeout(onDone, 6000);
    return () => window.clearTimeout(id);
  }, [look.id, onDone]);
  return (
    <div role="status" className="pop-in fixed inset-x-4 bottom-24 z-40 mx-auto flex max-w-md items-center justify-between gap-4 rounded-full border border-hairline bg-graphite/95 py-2 pr-2 pl-5 shadow-2xl shadow-onyx backdrop-blur lg:bottom-8">
      <span className="truncate text-body">
        Hidden <span className="text-stone">{look.name}</span>. You&apos;ll see fewer like it.
      </span>
      <button
        type="button"
        onClick={() => {
          unhideLook(look.id);
          onDone();
        }}
        className={`shrink-0 rounded-full border border-hairline px-4 py-1.5 text-body font-medium hover:border-stone/50 ${focusRing}`}
      >
        Undo
      </button>
    </div>
  );
}

function DecodeTile() {
  return (
    // Sits in the feed and points at the other way in: any screenshot.
    <Link
      href="/decode"
      className={`surface relative isolate flex aspect-[10/9] flex-col justify-end gap-2 overflow-hidden rounded-card p-5 transition-colors hover:border-champagne/50 ${focusRing}`}
    >
      <Dither className="-z-10 opacity-25" cell={5} interactive />
      <Bloom name="bloom-1" className="absolute -top-8 -right-8 -z-10 w-36 opacity-70" rotate={25} />
      <span className="font-serif text-title leading-tight">
        Not seeing <em className="accent-word">your</em> cut?
      </span>
      <span className="text-body text-stone">Decode any screenshot into barber words, then try it on.</span>
      <span className="text-caption tracking-widest text-champagne uppercase">Decode a cut →</span>
    </Link>
  );
}

const DISCOVER_BACKDROP: Backdrop = {
  tone: "gold",
  dither: true,
  blooms: [
    { name: "peony-tr", className: "-top-10 -right-24 w-[26rem] opacity-70", rotate: -25, delay: 0 },
    { name: "bloom-2", className: "top-40 right-[28%] hidden w-44 opacity-50 xl:block", rotate: 15, delay: 3 },
    { name: "petal-1", className: "top-24 left-[42%] hidden w-12 opacity-60 lg:block", rotate: 40, delay: 5 },
  ],
};

const PLACEHOLDER_RATIOS = [1.3, 1.6, 1.1, 1.45, 1.25, 1.55, 1.15, 1.4];

function SkeletonGrid() {
  return (
    <MasonryColumns
      label="Loading looks"
      items={PLACEHOLDER_RATIOS.concat(PLACEHOLDER_RATIOS).map((r, i) => ({ r, i }))}
      ratio={(x) => x.r}
      getKey={(x) => String(x.i)}
      render={(x) => <div className="animate-pulse rounded-card bg-graphite" style={{ aspectRatio: `1 / ${x.r}`, animationDelay: `${x.i * 70}ms` }} />}
    />
  );
}

/** Shown until real photos are added: the shape of the gallery, honestly labelled. */
function LibraryComingSoon() {
  return (
    <div className="relative">
      <div aria-hidden>
        <SkeletonGrid />
      </div>
      <div className="absolute inset-x-0 top-16 flex justify-center px-4">
        <div className="flex max-w-sm flex-col items-center gap-3 rounded-card border border-hairline bg-onyx px-6 py-8 text-center">
          <h2 className="font-serif text-title">The library is being stocked</h2>
          <p className="text-body text-stone">Reference photos land here soon. Meanwhile, you can try any cut from a screenshot.</p>
          <Link href="/decode" className={buttonClass("primary")}>
            Decode a screenshot
          </Link>
        </div>
      </div>
    </div>
  );
}
