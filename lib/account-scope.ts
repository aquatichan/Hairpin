"use client";

import { useSyncExternalStore } from "react";

/**
 * Whose private data this tab may read and write.
 *
 *  - a Firebase uid when someone is signed in: each account gets its own IndexedDB database and its own
 *    localStorage keys, so two people on one device never see each other's photo, try-ons, briefs or boards;
 *  - "device" in preview builds without sign-in (one person per device by definition);
 *  - null while sign-in is resolving or when signed out: nothing private is read or written.
 *
 * Storage modules wait for a scope (see `whenScoped`) instead of falling back to a shared key.
 */
export type AccountScope = string | null;

export const DEVICE_SCOPE = "device";

let scope: AccountScope = null;
const listeners = new Set<() => void>();
let waiters: ((s: string) => void)[] = [];

export function setAccountScope(next: AccountScope) {
  if (next === scope) return;
  scope = next;
  if (next) {
    const ready = waiters;
    waiters = [];
    ready.forEach((w) => w(next));
  }
  listeners.forEach((l) => l());
}

export const getAccountScope = () => scope;

/** Resolves with the current scope, or the next one once sign-in has resolved. */
export function whenScoped(): Promise<string> {
  return scope ? Promise.resolve(scope) : new Promise((resolve) => waiters.push(resolve));
}

export function subscribeScope(listener: () => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

/** A localStorage key that belongs to one account, e.g. `hairpin:profile@uid`. */
export const scopedKey = (base: string, s: AccountScope = scope) => (s ? `${base}@${s}` : null);

export function useAccountScope(): AccountScope {
  return useSyncExternalStore(subscribeScope, getAccountScope, () => null);
}
