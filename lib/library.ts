"use client";

import { useSyncExternalStore } from "react";
import { DEVICE_SCOPE, getAccountScope, scopedKey, subscribeScope } from "./account-scope";
import { authHeader } from "./api-client";
import {
  emptyLibrary,
  hasContent,
  isLibraryError,
  mergeLibraries,
  resetLibrary,
  sameLibrary,
  sanitizeLibrary,
  type Library,
  type LibraryError,
} from "./library-model";
import { curatedIds } from "./looks";
import { isKeepableLookId } from "./style";

/**
 * The signed-in person's saved looks and boards.
 *
 * Changes apply instantly to a per-account copy in localStorage (`hairpin:library@<uid>`), then sync to
 * /api/library in the background, so the same boards appear on any device the person signs in to. Preview builds
 * (no accounts) keep the copy on this device only. Only look IDs and board names are stored; never images.
 */
const KEY = "hairpin:library";
type Stored = { lib: Library; syncedAt: number };
export type SyncState = "local" | "syncing" | "synced" | "offline" | "unavailable";

/** Curated IDs must exist; private (m-) and community (p-) IDs are kept even if this build can't resolve them. */
const isKnownLook = (id: string) => isKeepableLookId(id, curatedIds);
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

let cache: { key: string | null; raw: string | null; value: Stored | null } = { key: null, raw: null, value: null };

function read(): Stored | null {
  const key = scopedKey(KEY);
  let raw: string | null = null;
  try {
    raw = key ? localStorage.getItem(key) : null;
  } catch {}
  if (key !== cache.key || raw !== cache.raw) {
    let value: Stored | null = key ? { lib: emptyLibrary(), syncedAt: 0 } : null;
    if (key && raw) {
      try {
        const parsed = JSON.parse(raw) as { lib?: unknown; syncedAt?: unknown };
        const lib = sanitizeLibrary(parsed.lib, isKnownLook);
        if (lib) value = { lib, syncedAt: typeof parsed.syncedAt === "number" ? parsed.syncedAt : 0 };
      } catch {}
    }
    cache = { key, raw, value };
  }
  return cache.value;
}

function write(stored: Stored, scope = getAccountScope()) {
  const key = scopedKey(KEY, scope);
  if (!key || scope !== getAccountScope()) return;
  try {
    localStorage.setItem(key, JSON.stringify(stored));
  } catch {}
  notify();
}

/* ---------- sync ---------- */

/* ---------- server clock ---------- */

/** Server time minus device time, learnt on every sync and kept per device, so edits are ordered by the server's clock. */
const OFFSET_KEY = "hairpin:clock-offset";
let offset = (() => {
  try {
    return Number(localStorage.getItem(OFFSET_KEY)) || 0;
  } catch {
    return 0;
  }
})();
function learnServerTime(body: { serverTime?: unknown } | null, sentAt: number) {
  const t = body?.serverTime;
  if (typeof t !== "number") return;
  // Midpoint of the round trip.
  offset = Math.round(t - (sentAt + Date.now()) / 2);
  try {
    localStorage.setItem(OFFSET_KEY, String(offset));
  } catch {}
}
export const syncedNow = () => Date.now() + offset;

let syncState: SyncState = "local";
const setSync = (s: SyncState) => {
  if (s !== syncState) {
    syncState = s;
    notify();
  }
};
const accountScope = () => {
  const s = getAccountScope();
  return s && s !== DEVICE_SCOPE ? s : null;
};

async function call(method: "GET" | "PUT" | "DELETE", body?: unknown): Promise<Response | null> {
  try {
    // Only the sign-in token: never the person's own AI key, which /api/library has no use for.
    return await fetch("/api/library", {
      method,
      headers: { ...(await authHeader()), ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
  } catch {
    return null;
  }
}

function settle(res: Response | null) {
  if (!res) setSync("offline");
  else if (res.status === 503 || res.status === 401) setSync("unavailable");
  else setSync("offline");
}

let pushTimer: number | undefined;
let pushing = false;
let again = false;

/** Sends this device's copy; the server merges it with the stored one and returns the result. */
async function push() {
  const scope = accountScope();
  const stored = read();
  if (!scope || !stored) return;
  if (pushing) {
    again = true;
    return;
  }
  pushing = true;
  setSync("syncing");
  const sentAt = Date.now();
  const res = await call("PUT", { library: stored.lib });
  pushing = false;
  if (getAccountScope() !== scope) return; // signed out or switched accounts meanwhile: drop the answer
  if (!res?.ok) return settle(res);
  const body = await res.json().catch(() => null);
  learnServerTime(body, sentAt);
  const server = sanitizeLibrary(body?.library, isKnownLook);
  if (!server) return setSync("offline");
  // Merge rather than replace: edits made while the request was in flight survive.
  const local = read() ?? { lib: emptyLibrary(), syncedAt: 0 };
  const merged = mergeLibraries(server, local.lib, Date.now());
  write({ lib: merged, syncedAt: server.updatedAt }, scope);
  if (again || !sameLibrary(merged, server)) {
    again = false;
    schedulePush();
  } else setSync("synced");
}

function schedulePush() {
  if (!accountScope()) return;
  window.clearTimeout(pushTimer);
  pushTimer = window.setTimeout(push, 400);
}

let lastPull = 0;
/** Fetches the account's copy, merges it with this device's, and sends back anything the server didn't have. */
async function pull() {
  const scope = accountScope();
  if (!scope) return setSync("local");
  lastPull = Date.now();
  setSync("syncing");
  const sentAt = Date.now();
  const res = await call("GET");
  if (getAccountScope() !== scope) return;
  if (!res?.ok) return settle(res);
  const body = await res.json().catch(() => null);
  learnServerTime(body, sentAt);
  const server = sanitizeLibrary(body?.library, isKnownLook);
  const local = read() ?? { lib: emptyLibrary(), syncedAt: 0 };
  if (!server) {
    if (hasContent(local.lib)) return void push();
    return setSync("synced");
  }
  const merged = mergeLibraries(server, local.lib, Date.now());
  write({ lib: merged, syncedAt: server.updatedAt }, scope);
  if (!sameLibrary(merged, server)) return void push();
  setSync("synced");
}

if (typeof window !== "undefined") {
  subscribeScope(() => {
    window.clearTimeout(pushTimer);
    notify();
    void pull();
  });
  const refresh = () => {
    if (Date.now() - lastPull > 15_000) void pull();
  };
  window.addEventListener("focus", refresh);
  window.addEventListener("online", () => void pull());
  window.addEventListener("storage", (e) => e.key === scopedKey(KEY) && notify());
  // Signed in before this module loaded.
  if (accountScope()) queueMicrotask(() => void pull());
}

/* ---------- public API ---------- */

/** Applies one change from lib/library-model.ts. Returns the error if the change was refused. */
export function updateLibrary(change: (lib: Library, now: number) => Library | LibraryError): LibraryError | null {
  const stored = read();
  if (!stored) return { error: "unknown_board" };
  const next = change(stored.lib, syncedNow());
  if (isLibraryError(next)) return next;
  if (next !== stored.lib) {
    write({ ...stored, lib: next });
    schedulePush();
  }
  return null;
}

/**
 * "Delete all my data": empties this account's library here and on the server. The server keeps only a reset marker,
 * so another of the person's devices that still has the old library can't push it back.
 */
export async function deleteLibraryEverywhere(): Promise<boolean> {
  const scope = getAccountScope();
  if (!scope) return false;
  window.clearTimeout(pushTimer);
  write({ lib: resetLibrary(syncedNow()), syncedAt: 0 }, scope);
  if (scope === DEVICE_SCOPE) return true;
  const res = await call("DELETE");
  return Boolean(res?.ok);
}

/** Merges looks saved before accounts existed into this account's library (only when the person says so). */
export function adoptSavedLookIds(ids: string[]) {
  updateLibrary((lib, now) => {
    const extra = ids.filter((id) => isKnownLook(id) && !lib.saved.some((s) => s.lookId === id));
    return extra.length ? { ...lib, saved: [...lib.saved, ...extra.map((lookId, i) => ({ lookId, savedAt: now - i - 1 }))], updatedAt: now } : lib;
  });
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};

/** This account's library, or null until sign-in has resolved. */
export function useLibrary(): Library | null {
  return useSyncExternalStore(subscribe, () => read()?.lib ?? null, () => null);
}

export function useSyncState(): SyncState {
  return useSyncExternalStore(subscribe, () => (accountScope() ? syncState : "local"), () => "local" as SyncState);
}
