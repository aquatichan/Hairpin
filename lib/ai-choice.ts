"use client";

import { useSyncExternalStore } from "react";

/**
 * How this person's AI runs, chosen on the gate screen and changed under You:
 * their publik plan, or their own OpenAI key. The own key stays on this
 * device; the server uses it for one request at a time and never stores it.
 */
export type AiChoice = { mode: "publik" } | { mode: "own"; key: string };

const STORAGE_KEY = "hairpin.ai-choice";
const EVENT = "hairpin:ai-choice";

function read(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function parse(raw: string | null): AiChoice | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as AiChoice;
    if (value.mode === "publik") return value;
    if (value.mode === "own" && typeof value.key === "string" && value.key) return value;
  } catch {}
  return null;
}

export function getChoice(): AiChoice | null {
  return parse(read());
}

/** Stores the person's choice. `null` clears it, so the gate asks again. */
export function setChoice(choice: AiChoice | null) {
  try {
    if (choice) localStorage.setItem(STORAGE_KEY, JSON.stringify(choice));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {}
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** The raw string is the snapshot, so React compares it by value. `undefined` until the page has hydrated. */
export function useAiChoice(): AiChoice | null | undefined {
  const raw = useSyncExternalStore(subscribe, () => read() ?? "", () => undefined);
  return raw === undefined ? undefined : parse(raw || null);
}
