"use client";

import { useSyncExternalStore } from "react";
import { scopedKey, subscribeScope } from "./account-scope";
import { isVendor, type Vendor } from "./ai-vendors";

/**
 * How this person's AI runs, chosen on the gate screen and changed under You:
 * their publik plan, their own key for one provider (lib/ai-vendors.ts), or the
 * app's free try-ons. An own key stays on this device; the server uses it for one
 * request at a time and never stores it.
 */
export type AiChoice = { mode: "publik" } | { mode: "own"; vendor: Vendor; key: string } | { mode: "free" };

export const AI_CHOICE_KEY = "hairpin.ai-choice";
const EVENT = "hairpin:ai-choice";

/** Per account: one person's own key is never used for, or visible to, another account on this device. */
function read(): string | null {
  const key = scopedKey(AI_CHOICE_KEY);
  if (!key) return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function parse(raw: string | null): AiChoice | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as AiChoice;
    if (value.mode === "publik" || value.mode === "free") return { mode: value.mode };
    // Keys saved before other providers existed were OpenAI keys.
    if (value.mode === "own" && typeof value.key === "string" && value.key) return { mode: "own", vendor: isVendor(value.vendor) ? value.vendor : "openai", key: value.key };
  } catch {}
  return null;
}

export function getChoice(): AiChoice | null {
  return parse(read());
}

/** Stores the person's choice. `null` clears it, so the gate asks again. */
export function setChoice(choice: AiChoice | null) {
  const key = scopedKey(AI_CHOICE_KEY);
  try {
    if (key && choice) localStorage.setItem(key, JSON.stringify(choice));
    else if (key) localStorage.removeItem(key);
  } catch {}
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  const off = subscribeScope(onChange);
  return () => {
    off();
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

const PENDING = "\u0000pending";

/** The raw string is the snapshot, so React compares it by value. `undefined` until hydrated and signed in. */
export function useAiChoice(): AiChoice | null | undefined {
  const raw = useSyncExternalStore(subscribe, () => (scopedKey(AI_CHOICE_KEY) ? (read() ?? "") : PENDING), () => undefined);
  return raw === undefined || raw === PENDING ? undefined : parse(raw || null);
}
