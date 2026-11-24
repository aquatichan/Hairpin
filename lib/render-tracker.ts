"use client";

import { useSyncExternalStore } from "react";

/**
 * Try-ons in flight in this tab. A render is a request from this tab: it keeps going while the person moves around
 * Hairpin, but a reload, closing the tab or losing the connection ends it, and the result is lost (the server never
 * keeps images). While one is running, leaving the page asks for confirmation.
 */
type State = { pending: number; ready: { id: string; label: string } | null };
let state: State = { pending: 0, ready: null };
const listeners = new Set<() => void>();
const set = (next: State) => {
  state = next;
  listeners.forEach((l) => l());
};

function onBeforeUnload(e: BeforeUnloadEvent) {
  e.preventDefault();
  e.returnValue = "";
}

export async function trackRender<T extends { id: string; lookName: string }>(work: Promise<T>): Promise<T> {
  set({ ...state, pending: state.pending + 1 });
  if (state.pending === 1) window.addEventListener("beforeunload", onBeforeUnload);
  try {
    const made = await work;
    set({ pending: state.pending - 1, ready: { id: made.id, label: made.lookName } });
    return made;
  } catch (e) {
    set({ ...state, pending: state.pending - 1 });
    throw e;
  } finally {
    if (state.pending === 0) window.removeEventListener("beforeunload", onBeforeUnload);
  }
}

export const dismissReady = () => set({ ...state, ready: null });

export function useRenderTracker(): State {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => void listeners.delete(l);
    },
    () => state,
    () => state,
  );
}
