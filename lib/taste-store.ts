"use client";

import { useSyncExternalStore } from "react";
import { scopedKey, subscribeScope } from "./account-scope";
import { featureKeys, type FeedItem } from "./feed";
import { applyEvent, emptyTaste, markSeen, parseTaste, unhide, type TasteEvent, type TasteState } from "./taste";

/** Per account, this device only. Never synced: what someone opens and skips stays with them. */
export const TASTE_KEY = "hairpin:taste";

const listeners = new Set<() => void>();
let cache: { key: string | null; raw: string | null; value: TasteState | null } = { key: null, raw: null, value: null };

function read(): TasteState | null {
  const key = scopedKey(TASTE_KEY);
  let raw: string | null = null;
  try {
    raw = key ? localStorage.getItem(key) : null;
  } catch {}
  if (key !== cache.key || raw !== cache.raw) {
    let value: TasteState | null = null;
    if (key) {
      try {
        value = raw ? parseTaste(JSON.parse(raw)) : emptyTaste();
      } catch {
        value = emptyTaste();
      }
    }
    cache = { key, raw, value };
  }
  return cache.value;
}

function write(next: TasteState) {
  const key = scopedKey(TASTE_KEY);
  if (!key) return;
  try {
    localStorage.setItem(key, JSON.stringify(next));
  } catch {}
  listeners.forEach((l) => l());
}

const update = (fn: (s: TasteState) => TasteState) => {
  const cur = read();
  if (cur) write(fn(cur));
};

export const recordTaste = (event: TasteEvent, look: FeedItem) => update((s) => applyEvent(s, event, featureKeys(look), Date.now(), look.id));
export const unhideLook = (id: string) => update((s) => unhide(s, id));
export const markLooksSeen = (ids: readonly string[]) => ids.length && update((s) => markSeen(s, ids, Date.now()));
/** "Reset recommendations": forget taste, seen and hidden. */
export const clearTaste = () => write(emptyTaste());
/** Snapshot without subscribing, for the start of a feed session. */
export const readTaste = () => read();

const subscribe = (l: () => void) => {
  listeners.add(l);
  const off = subscribeScope(l);
  const onStorage = (e: StorageEvent) => e.key === scopedKey(TASTE_KEY) && l();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(l);
    off();
    window.removeEventListener("storage", onStorage);
  };
};

/** `null` on the server and until sign-in has resolved. */
export function useTaste(): TasteState | null {
  return useSyncExternalStore(subscribe, read, () => null);
}
