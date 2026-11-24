"use client";

import { useSyncExternalStore } from "react";
import { scopedKey, subscribeScope, whenScoped } from "./account-scope";
import type { HairType } from "./hair-types";
import type { FaceShape, LookFor } from "./style";

/** The person's own description of their hair and cut rhythm. Kept on this device, per account. */
export type Profile = {
  onboardedAt: number | null;
  length: "short" | "medium" | "long" | null;
  texture: "straight" | "wavy" | "curly" | "coily" | null;
  /** 1A-4C (lib/hair-types.ts). When set, `texture` follows its family. */
  hairType: HairType | null;
  /** Natural colour in plain words, e.g. "dark brown". */
  color: string | null;
  density: "fine" | "medium" | "thick" | null;
  /** ISO date (yyyy-mm-dd) of the last haircut. */
  lastCut: string | null;
  everyWeeks: number;
  /** "Show me": which cuts to browse. null = not chosen yet (treated as both). */
  lookFor: LookFor | null;
  /** Confirmed by the person; a scan only ever suggests. */
  faceShape: FaceShape | null;
  /** "picked" by hand, or a scan "suggested" it and the person confirmed. */
  faceShapeSource: "picked" | "suggested" | null;
};

export const PROFILE_KEY = "hairpin:profile";
const EMPTY: Profile = { onboardedAt: null, length: null, texture: null, hairType: null, color: null, density: null, lastCut: null, everyWeeks: 4, lookFor: null, faceShape: null, faceShapeSource: null };
const listeners = new Set<() => void>();
let cache: { key: string | null; raw: string | null; value: Profile | null } = { key: null, raw: null, value: null };

/** This account's profile, or null until sign-in has resolved (there is no shared fallback). */
function read(): Profile | null {
  const key = scopedKey(PROFILE_KEY);
  let raw: string | null = null;
  try {
    raw = key ? localStorage.getItem(key) : null;
  } catch {}
  if (key !== cache.key || raw !== cache.raw) {
    let value: Profile | null = key ? EMPTY : null;
    try {
      if (key && raw) value = { ...EMPTY, ...JSON.parse(raw) };
    } catch {}
    cache = { key, raw, value };
  }
  return cache.value;
}

const notify = () => listeners.forEach((l) => l());

export function saveProfile(patch: Partial<Profile>) {
  const key = scopedKey(PROFILE_KEY);
  // Before sign-in resolves there is no account to write to; apply the change once there is.
  if (!key) return void whenScoped().then(() => saveProfile(patch));
  try {
    localStorage.setItem(key, JSON.stringify({ ...(read() ?? EMPTY), ...patch }));
  } catch {}
  notify();
}

export function clearProfile() {
  const key = scopedKey(PROFILE_KEY);
  try {
    if (key) localStorage.removeItem(key);
  } catch {}
  notify();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  const off = subscribeScope(l);
  return () => {
    listeners.delete(l);
    off();
  };
};

/** `null` on the server, before hydration and until sign-in has resolved. */
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
