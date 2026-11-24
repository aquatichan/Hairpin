"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { Bloom } from "@/components/fx/bloom";
import { Dither } from "@/components/fx/dither";
import { Grainient } from "@/components/fx/grainient";
import { PixelSurface } from "@/components/fx/pixel-surface";
import { Avatar } from "@/components/ui/avatar";
import { BlobImage } from "@/components/ui/blob-image";
import { Button, buttonClass } from "@/components/ui/button";
import { ChoiceRow } from "@/components/ui/choice-row";
import { Page, type Backdrop } from "@/components/ui/page";
import { deleteAccountData } from "@/lib/account-delete";
import { setChoice, useAiChoice } from "@/lib/ai-choice";
import { VENDOR_INFO } from "@/lib/ai-vendors";
import { deleteLibraryEverywhere, useLibrary } from "@/lib/library";
import { localStore } from "@/lib/local-store";
import { libraryLooks, type Look } from "@/lib/looks";
import { deleteAllShared } from "@/lib/community";
import { clearTaste, useTaste } from "@/lib/taste-store";
import { rankFeed } from "@/lib/feed";
import { LOOK_FOR, LOOK_FOR_LABEL } from "@/lib/style";
import { useSavedLooks } from "@/lib/saved-looks";
import { contextFrom } from "@/components/feed/use-feed";
import { clearProfile, daysUntilNextCut, saveProfile, useProfile } from "@/lib/profile";
import { useLocal } from "@/lib/use-local";
import { FaceScan } from "@/components/face/face-scan";
import { HairAnalysisPanel } from "@/components/hair/hair-analysis";
import { HairTypePicker } from "@/components/hair/hair-type-picker";
import { HAIR_TYPE_INFO, hairTypeLabel, textureOf } from "@/lib/hair-types";

const LENGTHS = ["short", "medium", "long"] as const;
const TEXTURES = ["straight", "wavy", "curly", "coily"] as const;
const DENSITIES = ["fine", "medium", "thick"] as const;
const input = "h-12 rounded-card border border-hairline bg-slate px-4 text-body text-ivory focus-visible:outline-2 focus-visible:outline-champagne-light";
const byId = new Map(libraryLooks.map((l) => [l.id, l]));

function Panel({ title, children, tone = "default", className = "" }: { title: string; children: React.ReactNode; tone?: "default" | "danger"; className?: string }) {
  return (
    <section className={`surface surface--grain flex flex-col gap-4 rounded-[var(--r-panel)] p-6 ${tone === "danger" ? "border-hairline" : ""} ${className}`}>
      <h2 className="font-serif text-title">{title}</h2>
      {children}
    </section>
  );
}

const memberSince = (iso: string | null) => (iso ? new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(new Date(iso)) : null);

/** Greeting by time of day, chosen after mount so server and client render the same HTML. */
function useGreeting() {
  const [hello, setHello] = useState("Welcome back");
  useEffect(() => {
    const h = new Date().getHours();
    queueMicrotask(() => setHello(h < 5 ? "Still up" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening"));
  }, []);
  return hello;
}

function Hero() {
  const { user } = useAuth();
  const profile = useProfile();
  const hello = useGreeting();
  const first = user?.name?.split(" ")[0] ?? null;
  const since = memberSince(user?.createdAt ?? null);
  const chips = [profile?.hairType ? `${hairTypeLabel(profile.hairType)} ${HAIR_TYPE_INFO[profile.hairType].name.toLowerCase()}` : profile?.texture, profile?.length && `${profile.length} length`, profile?.color].filter(Boolean) as string[];
  return (
    <section className="surface relative isolate overflow-hidden rounded-[var(--r-panel)] p-6 lg:p-12">
      <Grainient tone="gold" className="-z-10" />
      <Dither className="-z-10 opacity-[0.12]" cell={6} interactive />
      <Bloom name="peony-tr" className="page-bloom absolute -top-10 -right-20 -z-10 w-[26rem] opacity-80" rotate={-25} />
      <Bloom name="bloom-2" className="absolute right-[34%] -bottom-10 -z-10 hidden w-48 opacity-50 xl:block" rotate={12} delay={3} />
      <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:gap-12">
        <div className="relative shrink-0">
          <Avatar name={user?.name} photoUrl={user?.photoUrl} className="size-28 border-2 border-champagne lg:size-40" textClass="text-display" />
          <Bloom name="petal-1" className="absolute -right-4 -bottom-2 w-12" rotate={30} />
          <Bloom name="petal-5" className="absolute -top-2 -left-4 w-10" rotate={-40} delay={2} />
        </div>
        <div className="flex min-w-0 flex-col gap-3">
          <p className="text-caption font-medium tracking-[0.28em] text-champagne uppercase">{hello}</p>
          <h1 className="font-serif text-display leading-[1.02] text-balance">
            {first ? (
              <>
                Hi, <em className="accent-word">{first}</em>
              </>
            ) : (
              <>
                Your <em className="accent-word">profile</em>
              </>
            )}
          </h1>
          <div className="flex flex-wrap items-center gap-3">
            {chips.map((c) => (
              <span key={c} className="rounded-full border border-champagne/40 bg-onyx/40 px-4 py-1.5 text-body text-champagne backdrop-blur-sm first-letter:uppercase">
                {c}
              </span>
            ))}
            {!chips.length && (
              <a href="#hair" className="rounded-full border border-hairline bg-onyx/40 px-4 py-1.5 text-body text-stone backdrop-blur-sm hover:text-ivory">
                Tell us about your hair
              </a>
            )}
            {since && <span className="font-mono text-caption text-stone">Member since {since}</span>}
          </div>
        </div>
      </div>
    </section>
  );
}

function Stats() {
  const lib = useLibrary();
  const priv = useLocal(async () => ({ renders: (await localStore.list("renders")).length, briefs: (await localStore.list("briefs")).length }), "you-stats");
  const tiles = [
    { label: "Saved looks", n: lib?.saved.length, href: "/saved" },
    { label: "Boards", n: lib?.boards.length, href: "/saved?tab=boards" },
    { label: "Try-ons", n: priv?.renders, href: "/saved?tab=tryons" },
    { label: "Barber Briefs", n: priv?.briefs, href: "/saved?tab=briefs" },
  ];
  return (
    <ul className="grid grid-cols-2 gap-4 lg:grid-cols-4 lg:gap-6">
      {tiles.map((t) => (
        <li key={t.label}>
          <PixelSurface className="surface rounded-card transition-colors hover:border-champagne/40" gap={12}>
            <Link href={t.href} data-tilt="6" className="relative flex flex-col gap-1 rounded-card p-6 focus-visible:outline-2 focus-visible:outline-champagne-light">
              <span className="font-serif text-display leading-none text-champagne lining-nums">{t.n ?? "–"}</span>
              <span className="text-caption tracking-widest text-stone uppercase">{t.label}</span>
            </Link>
          </PixelSurface>
        </li>
      ))}
    </ul>
  );
}

/** What the person's saved looks say about their taste: a bar for each length and texture. */
function StyleDna() {
  const lib = useLibrary();
  const saved = useMemo(() => (lib?.saved ?? []).map((s) => byId.get(s.lookId)).filter((l): l is Look => Boolean(l)), [lib]);
  const tally = <K extends string>(opts: readonly K[], pick: (l: Look) => string) => opts.map((o) => ({ o, n: saved.filter((l) => pick(l) === o).length }));
  const lengths = tally(LENGTHS, (l) => l.length);
  const textures = tally(TEXTURES, (l) => l.texture);
  const topTexture = [...textures].sort((a, b) => b.n - a.n)[0];
  const topLength = [...lengths].sort((a, b) => b.n - a.n)[0];
  return (
    <Panel title="Your style DNA">
      {saved.length === 0 ? (
        <>
          <p className="text-body text-stone">Save a few looks in Discover and this fills in with what you keep coming back to.</p>
          <Link href="/discover" className={`${buttonClass("ghost")} self-start`}>
            Find some looks
          </Link>
        </>
      ) : (
        <>
          <p className="text-lead text-stone">
            Your saves lean <span className="text-ivory capitalize">{topLength.o}</span> and <span className="text-ivory capitalize">{topTexture.o}</span>.
          </p>
          <div className="grid gap-6 sm:grid-cols-2">
            {[
              ["Length", lengths],
              ["Texture", textures],
            ].map(([label, rows]) => (
              <div key={label as string} className="flex flex-col gap-3">
                <p className="text-caption tracking-widest text-champagne uppercase">{label as string}</p>
                {(rows as { o: string; n: number }[]).map(({ o, n }) => (
                  <div key={o} className="grid grid-cols-[4.5rem_1fr_1.5rem] items-center gap-3 text-body">
                    <span className="text-stone capitalize">{o}</span>
                    <span className="h-2 overflow-hidden rounded-full bg-slate">
                      <span className="block h-full rounded-full bg-linear-to-r/oklch from-champagne-deep to-champagne-light transition-[width] duration-700 ease-out" style={{ width: `${(n / saved.length) * 100}%` }} />
                    </span>
                    <span className="text-right font-mono text-caption text-stone">{n}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </>
      )}
    </Panel>
  );
}

/** The top of the person's Discover feed, from the same ranker. */
function PickedForYou() {
  const profile = useProfile();
  const taste = useTaste();
  const saved = useSavedLooks();
  const [now] = useState(() => Date.now());
  const picks = useMemo(() => {
    if (!profile || !taste || !saved) return [];
    if (!profile.length && !profile.texture && !profile.hairType && !profile.lookFor && !profile.faceShape) return [];
    const ctx = contextFrom(profile, taste, new Set(saved), "you-page", now);
    return rankFeed(libraryLooks, ctx).slice(0, 4);
  }, [profile, taste, saved, now]);
  return (
    <Panel title="Picked for you">
      {picks.length === 0 ? (
        <p className="text-body text-stone">Add your hair type, length or face shape and the cuts that suit you show up here first.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {picks.map(({ item: l, reasons }) => (
            <li key={l.id}>
              <Link href={`/discover?look=${encodeURIComponent(l.id)}`} className="group flex flex-col gap-2 rounded-card focus-visible:outline-2 focus-visible:outline-champagne-light">
                <span className="relative block aspect-[3/4] overflow-hidden rounded-card border border-hairline bg-slate transition-colors group-hover:border-champagne/40">
                  <Image src={l.image} alt={l.alt ?? l.name} fill sizes="(min-width: 1280px) 12vw, 25vw" className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]" />
                </span>
                <span className="truncate text-body font-medium">{l.name}</span>
                {reasons[0] && <span className="-mt-1.5 truncate text-caption text-champagne">{reasons[0]}</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/** Forget what Discover learned from opens, saves, tries and "Not for me". Kept on this device only. */
function ResetRecommendations() {
  const taste = useTaste();
  const [done, setDone] = useState(false);
  const learned = taste ? Object.keys(taste.f).length + Object.keys(taste.hidden).length : 0;
  return (
    <div className="flex flex-col gap-2 border-t border-hairline pt-4">
      <p className="text-caption text-stone">Discover learns from what you open, save, try and hide, on this device only. It&apos;s never sent to us.</p>
      <button
        type="button"
        disabled={!learned}
        onClick={() => {
          clearTaste();
          setDone(true);
        }}
        className="self-start text-caption text-stone underline underline-offset-4 hover:text-ivory disabled:no-underline disabled:opacity-60"
      >
        {done && !learned ? "Recommendations reset" : "Reset recommendations"}
      </button>
    </div>
  );
}

function NextCut() {
  const profile = useProfile();
  // The date is read after mount so server and client render the same HTML.
  const [today, setToday] = useState<Date | null>(null);
  useEffect(() => {
    queueMicrotask(() => setToday(new Date()));
  }, []);
  if (!profile) return null;
  const days = today ? daysUntilNextCut(profile, today) : null;
  const total = profile.everyWeeks * 7;
  const done = days === null ? 0 : Math.min(1, Math.max(0, (total - days) / total));
  const R = 44;
  return (
    <Panel title="Next cut">
      <div className="flex items-center gap-6">
        <div className="relative grid size-28 shrink-0 place-items-center">
          <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90" aria-hidden>
            <circle cx="50" cy="50" r={R} fill="none" strokeWidth="5" className="stroke-slate" />
            <circle cx="50" cy="50" r={R} fill="none" strokeWidth="5" strokeLinecap="round" className="stroke-champagne transition-[stroke-dashoffset] duration-700" strokeDasharray={2 * Math.PI * R} strokeDashoffset={2 * Math.PI * R * (1 - done)} />
          </svg>
          {days !== null ? <span data-testid="days-to-go" className="font-serif text-display leading-none lining-nums">{Math.abs(days)}</span> : <span className="font-serif text-title text-stone">–</span>}
        </div>
        <p className="text-body text-stone">
          {days === null ? "Add the date of your last cut and we'll count down to the next one." : days > 0 ? `day${days === 1 ? "" : "s"} to go` : days === 0 ? "days: it's today" : `day${days === -1 ? "" : "s"} overdue`}
        </p>
      </div>
      <div className="flex gap-3">
        <label className="flex flex-1 flex-col gap-2 text-body text-stone">
          Last cut
          <input type="date" value={profile.lastCut ?? ""} max={today?.toISOString().slice(0, 10)} onChange={(e) => saveProfile({ lastCut: e.target.value || null })} className={input} />
        </label>
        <label className="flex w-28 flex-col gap-2 text-body text-stone">
          Every (weeks)
          <input type="number" min={1} max={26} value={profile.everyWeeks} onChange={(e) => saveProfile({ everyWeeks: Math.min(26, Math.max(1, Number(e.target.value) || 1)) })} className={input} />
        </label>
      </div>
      {days !== null && days <= 7 && (
        <Link href="/discover" className={buttonClass("primary")}>
          Plan my next cut
        </Link>
      )}
    </Panel>
  );
}

function HairPanel() {
  const profile = useProfile();
  return (
    <section id="hair" className="surface surface--grain flex scroll-mt-8 flex-col gap-6 rounded-[var(--r-panel)] p-6">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="font-serif text-title">My hair</h2>
        {profile?.hairType && <span className="font-mono text-lead text-champagne">{hairTypeLabel(profile.hairType)}</span>}
      </div>
      <ChoiceRow label="Show me" options={LOOK_FOR} value={profile?.lookFor ?? null} onChange={(lookFor) => saveProfile({ lookFor })} render={(v) => LOOK_FOR_LABEL[v]} />
      <HairAnalysisPanel />
      <div className="flex flex-col gap-2">
        <p className="text-body text-stone">Hair type</p>
        <HairTypePicker value={profile?.hairType ?? null} onChange={(t) => saveProfile({ hairType: t, texture: textureOf(t) })} compact />
      </div>
      <ChoiceRow label="Length" options={LENGTHS} value={profile?.length ?? null} onChange={(length) => saveProfile({ length })} />
      <ChoiceRow label="Thickness" options={DENSITIES} value={profile?.density ?? null} onChange={(density) => saveProfile({ density })} />
      {profile?.color && <p className="text-body text-stone">Natural colour: <span className="text-ivory">{profile.color}</span></p>}
      <Link href="/welcome?next=%2Fyou" className="self-start text-caption text-stone underline underline-offset-4 hover:text-ivory">
        Replay the introduction
      </Link>
    </section>
  );
}

function FacePanel() {
  return (
    <section id="face" className="surface surface--grain flex scroll-mt-8 flex-col gap-4 rounded-[var(--r-panel)] p-6">
      <h2 className="font-serif text-title">My face</h2>
      <FaceScan />
    </section>
  );
}

function PhotoPanel() {
  const photo = useLocal(() => localStore.get("photo", "active").then((p) => p ?? null), "photo");
  return (
    <Panel title="My photo">
      {photo ? (
        <div className="flex gap-4">
          <BlobImage blob={photo.blob} alt="Your photo" className="aspect-[4/5] w-28 shrink-0" />
          <div className="flex flex-col justify-between gap-3">
            <p className="text-body text-stone">Used for every try-on. Stored on this device only.</p>
            <Button variant="ghost" onClick={() => localStore.remove("photo", "active")}>
              Delete photo
            </Button>
          </div>
        </div>
      ) : (
        <>
          <p className="text-body text-stone">No photo saved yet.</p>
          <Link href="/try" className={`${buttonClass("ghost")} self-start`}>
            Add a photo
          </Link>
        </>
      )}
    </Panel>
  );
}

function AiSetting() {
  const choice = useAiChoice();
  if (!choice) return null;
  return (
    <Panel title="AI">
      <p className="text-body text-stone">
        {choice.mode === "publik"
          ? "Your try-ons, Decode and Barber Briefs run on your publik plan."
          : choice.mode === "own"
            ? `Your try-ons, Decode and Barber Briefs run on your own ${VENDOR_INFO[choice.vendor].label} key, kept on this device for this account.`
            : "You're using Hairpin's free try-ons. Decode and Barber Briefs need a publik plan or your own key."}
      </p>
      <Button variant="ghost" onClick={() => setChoice(null)}>
        {choice.mode === "publik" ? "Use my own key instead" : choice.mode === "own" ? "Change key or provider, or use publik" : "Choose a plan or your own key"}
      </Button>
    </Panel>
  );
}

/** Deletes the account: server records, this device's copy, then the Google sign-in record. */
function DeleteAccount() {
  const { deleteAuthAccount } = useAuth();
  const router = useRouter();
  const [stage, setStage] = useState<"idle" | "confirm" | "working">("idle");
  const [note, setNote] = useState<string | null>(null);

  async function run() {
    setStage("working");
    setNote(null);
    const data = await deleteAccountData();
    if (!data.ok) {
      setNote(data.message);
      setStage("confirm");
      return;
    }
    try {
      await deleteAuthAccount();
      router.replace("/");
    } catch {
      setNote("Your Hairpin data is deleted. Your sign-in record couldn't be removed because the Google sign-in didn't complete. Try again to finish.");
      setStage("confirm");
    }
  }

  return (
    <Panel title="Delete account" tone="danger">
      <p className="text-body text-stone">
        Deletes your saved looks and boards, your link to publik and your usage counters on our server, everything on this device for this account, and
        your Hairpin sign-in. Your publik account and any provider keys are separate and stay as they are.
      </p>
      {stage === "idle" ? (
        <Button variant="ghost" onClick={() => setStage("confirm")}>
          Delete my account
        </Button>
      ) : (
        <div className="flex flex-col gap-3" role="group" aria-label="Confirm account deletion">
          <p className="text-body">This can&apos;t be undone.</p>
          <div className="flex gap-2">
            <Button className="flex-1" onClick={run} disabled={stage === "working"}>
              {stage === "working" ? "Deleting…" : "Delete my account"}
            </Button>
            <Button variant="ghost" className="flex-1" onClick={() => setStage("idle")} disabled={stage === "working"}>
              Keep it
            </Button>
          </div>
        </div>
      )}
      {note && (
        <p role="alert" className="text-caption text-ivory">
          {note}
        </p>
      )}
    </Panel>
  );
}


const YOU_BACKDROP: Backdrop = { tone: "mist" };

export default function You() {
  const { status, signOut } = useAuth();
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteNote, setDeleteNote] = useState<string | null>(null);

  /** This account only: its photo, try-ons, briefs, profile, own AI key here, and its boards on the server. */
  async function deleteEverything() {
    setDeleting(true);
    setDeleteNote(null);
    try {
      await localStore.clearAll();
      clearProfile();
      clearTaste();
      const synced = (await deleteLibraryEverywhere()) && (await deleteAllShared());
      setChoice(null);
      setDeleteNote(synced ? "Deleted." : "Deleted on this device. Your boards or shared cuts couldn't be removed from your account right now; try again when you're online.");
    } catch {
      setDeleteNote("Something went wrong deleting your data. Please try again.");
    } finally {
      setDeleting(false);
      setConfirming(false);
    }
  }

  return (
    <Page backdrop={YOU_BACKDROP}>
      <Hero />
      <Stats />

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] xl:gap-12">
        <div className="flex flex-col gap-8">
          <StyleDna />
          <PickedForYou />
          <NextCut />
        </div>
        <div className="flex flex-col gap-8">
          <HairPanel />
          <FacePanel />
          <PhotoPanel />
        </div>
      </div>

      <div className="grid gap-8 border-t border-hairline pt-8 md:grid-cols-2 2xl:grid-cols-4">
        <AiSetting />

        <Panel title="Privacy">
          <p className="text-body text-stone">
            Your photo, try-ons and Barber Briefs stay on this device, kept separate for each account that signs in here. Your saved looks and boards are also kept
            with your account so they follow you to other devices. Your photo only leaves this device when you generate a try-on, and nothing you save is ever
            shown in the public library.
          </p>
          {confirming ? (
            <div className="flex gap-3">
              <Button className="flex-1" onClick={deleteEverything} disabled={deleting}>
                Yes, delete it all
              </Button>
              <Button variant="ghost" className="flex-1" onClick={() => setConfirming(false)}>
                Keep it
              </Button>
            </div>
          ) : (
            <Button variant="ghost" onClick={() => setConfirming(true)}>
              Delete all my data
            </Button>
          )}
          {deleteNote && (
            <p role="status" className="text-caption text-stone">
              {deleteNote}
            </p>
          )}
          <ResetRecommendations />
        </Panel>

        {status === "signed-in" && <DeleteAccount />}

        {status === "signed-in" && (
          <Panel title="Account">
            <p className="text-body text-stone">
              Signing out hides your photo, try-ons and briefs from anyone else using this device, and forgets your own AI key here. They come back when you sign
              in again on this device.
            </p>
            <Button variant="ghost" onClick={() => signOut().then(() => router.replace("/"))}>
              Sign out
            </Button>
          </Panel>
        )}
      </div>
    </Page>
  );
}
