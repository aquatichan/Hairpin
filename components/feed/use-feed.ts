"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { scopedKey } from "@/lib/account-scope";
import { faceTags } from "@/lib/face-shape-guide";
import { personalKey, rankFeed, type FeedContext, type FeedTab, type Ranked } from "@/lib/feed";
import type { Look } from "@/lib/looks";
import { useProfile, type Profile } from "@/lib/profile";
import { useSavedLooks } from "@/lib/saved-looks";
import { tasteVector, type TasteState } from "@/lib/taste";
import { useTaste } from "@/lib/taste-store";

const SEED_KEY = "hairpin.feed-seed";
export const FEED_KEY = "hairpin:feed-key";

/** One seed per tab session: the order changes between visits but not while someone scrolls. */
function sessionSeed(): string {
  try {
    let s = sessionStorage.getItem(SEED_KEY);
    if (!s) {
      s = Math.random().toString(36).slice(2, 10);
      sessionStorage.setItem(SEED_KEY, s);
    }
    return s;
  } catch {
    return "static";
  }
}

export function contextFrom(profile: Profile, taste: TasteState, saved: ReadonlySet<string>, seed: string, now: number, showOther = false): FeedContext {
  return {
    hairType: profile.hairType,
    texture: profile.texture,
    length: profile.length,
    lookFor: profile.lookFor,
    faceShape: profile.faceShape,
    faceTags: faceTags(profile.faceShape),
    taste: tasteVector(taste, now),
    seen: taste.seen,
    saved,
    hidden: new Set(Object.keys(taste.hidden)),
    now,
    seed,
    showOther,
  };
}

type Snapshot = { key: string; ctx: FeedContext };

/**
 * The ranked feed for one session. Taste, saved and seen are snapshotted when the session starts and whenever the
 * personal inputs change, so saving or scrolling never reorders what's on screen; hiding removes a look in place.
 * `changed` is true when the inputs differ from the last time this account saw the feed: the refresh moment.
 */
export function useFeed(looks: Look[], tab: FeedTab, showOther: boolean) {
  const profile = useProfile();
  const taste = useTaste();
  const savedIds = useSavedLooks();
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [changed, setChanged] = useState(false);

  const ready = profile !== null && taste !== null && savedIds !== null;
  const key = profile ? `${personalKey(profile)}|${showOther ? 1 : 0}` : null;

  useEffect(() => {
    if (!ready || !key || snap?.key === key) return;
    const storeKey = scopedKey(FEED_KEY);
    let last: string | null = null;
    try {
      last = storeKey ? localStorage.getItem(storeKey) : null;
      if (storeKey) localStorage.setItem(storeKey, key);
    } catch {}
    // First visit ever: nothing to refresh from. Otherwise any change (here or on another page) gets the moment.
    const isChange = (snap !== null && snap.key !== key) || (last !== null && last !== key);
    const ctx = contextFrom(profile, taste, new Set(savedIds), sessionSeed(), Date.now(), showOther);
    queueMicrotask(() => {
      setSnap({ key, ctx });
      setChanged(isChange);
    });
  }, [ready, key, snap, profile, taste, savedIds, showOther]);

  const ranked = useMemo<Ranked<Look>[] | null>(() => (snap ? rankFeed(looks, snap.ctx, tab) : null), [looks, snap, tab]);

  // Hidden looks drop out immediately without re-ranking the rest.
  const hidden = useMemo(() => new Set(Object.keys(taste?.hidden ?? {})), [taste]);
  const visible = useMemo(() => ranked?.filter((r) => !hidden.has(r.item.id)) ?? null, [ranked, hidden]);

  const clearChanged = useCallback(() => setChanged(false), []);
  return { ranked: visible, ctx: snap?.ctx ?? null, changed, clearChanged, profile };
}
