"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { BlobImage } from "@/components/ui/blob-image";
import { Button, buttonClass } from "@/components/ui/button";
import { ChoiceRow } from "@/components/ui/choice-row";
import { localStore } from "@/lib/local-store";
import { clearProfile, daysUntilNextCut, saveProfile, useProfile } from "@/lib/profile";
import { useLocal } from "@/lib/use-local";

const LENGTHS = ["short", "medium", "long"] as const;
const TEXTURES = ["straight", "wavy", "curly", "coily"] as const;
const input = "h-12 rounded-card border border-hairline bg-slate px-4 text-body text-ivory";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4 border-t border-hairline pt-6">
      <h2 className="font-serif text-title">{title}</h2>
      {children}
    </section>
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

  return (
    <Section title="Next cut">
      {days !== null && (
        <p className="flex items-baseline gap-3">
          <span className="font-serif text-display">{Math.abs(days)}</span>
          <span className="text-body text-stone">{days > 0 ? `day${days === 1 ? "" : "s"} to go` : days === 0 ? "days: it's today" : `day${days === -1 ? "" : "s"} overdue`}</span>
        </p>
      )}
      <div className="flex gap-2">
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
    </Section>
  );
}

export default function You() {
  const { status, user, signOut } = useAuth();
  const router = useRouter();
  const profile = useProfile();
  const photo = useLocal(() => localStore.get("photo", "active").then((p) => p ?? null), "photo");
  const [confirming, setConfirming] = useState(false);

  async function deleteEverything() {
    for (const store of ["renders", "briefs"] as const) {
      for (const row of await localStore.list(store)) await localStore.remove(store, row.id);
    }
    await localStore.remove("photo", "active");
    clearProfile();
    setConfirming(false);
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 py-6">
      <h1 className="font-serif text-headline">{user?.name ?? "You"}</h1>

      <Section title="My photo">
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
            <Link href="/try" className={buttonClass("ghost")}>
              Add a photo
            </Link>
          </>
        )}
      </Section>

      <Section title="My hair">
        <ChoiceRow label="Length" options={LENGTHS} value={profile?.length ?? null} onChange={(length) => saveProfile({ length })} />
        <ChoiceRow label="Texture" options={TEXTURES} value={profile?.texture ?? null} onChange={(texture) => saveProfile({ texture })} />
      </Section>

      <NextCut />

      <Section title="Privacy">
        <p className="text-body text-stone">Your photo, renders and briefs are private. Your photo is only sent to the AI provider when you tap to try a cut. Nothing is ever used in the public library.</p>
        {confirming ? (
          <div className="flex gap-2">
            <Button className="flex-1" onClick={deleteEverything}>
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
      </Section>

      {status === "signed-in" && (
        <Section title="Account">
          <Button variant="ghost" onClick={() => signOut().then(() => router.replace("/"))}>
            Sign out
          </Button>
        </Section>
      )}
    </div>
  );
}
