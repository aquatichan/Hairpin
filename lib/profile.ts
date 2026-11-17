"use client";

import { useSyncExternalStore } from "react";

/** The user's own description of their hair and cut rhythm. Kept on this device. */
export type Profile = {
  onboardedAt: number | null;
  length: "short" | "medium" | "long" | null;
  texture: "straight" | "wavy" | "curly" | "coily" | null;
  /** ISO date (yyyy-mm-dd) of the last haircut. */
  lastCut: string | null;
  everyWeeks: number;
};

const KEY = "hairpin:profile";
const EMPTY: Profile = { onboardedAt: null, length: null, texture: null, lastCut: null, everyWeeks: 4 };
const listeners = new Set<() => void>();
let cache: { raw: string | null; value: Profile } = { raw: null, value: EMPTY };

function read(): Profile {
  const raw = localStorage.getItem(KEY);
  if (raw !== cache.raw) {
    let value = EMPTY;
    try {
      if (raw) value = { ...EMPTY, ...JSON.parse(raw) };
    } catch {}
    cache = { raw, value };
  }
  return cache.value;
}

export function saveProfile(patch: Partial<Profile>) {
  localStorage.setItem(KEY, JSON.stringify({ ...read(), ...patch }));
  listeners.forEach((l) => l());
}

export function clearProfile() {
  localStorage.removeItem(KEY);
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};

/** `null` while rendering on the server or before hydration. */
export function useProfile(): Profile | null {
  return useSyncExternalStore(subscribe, read, () => null);
}

/** Whole days until the next cut is due; negative when overdue. */
export function daysUntilNextCut(profile: Profile, today: Date): number | null {
  if (!profile.lastCut) return null;
  const last = new Date(`${profile.lastCut}T00:00:00`);
  if (Number.isNaN(last.getTime())) return null;
  const due = last.getTime() + profile.everyWeeks * 7 * 86_400_000;
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  return Math.round((due - start) / 86_400_000);
}
