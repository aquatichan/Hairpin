"use client";

import { useMemo } from "react";
import { useLibrary, updateLibrary } from "./library";
import { toggleSaved } from "./library-model";

/**
 * Saved Discover looks, newest first. A thin view over the account's library (lib/library.ts), which also holds
 * boards and syncs to the account.
 */
export function toggleSavedLook(id: string) {
  updateLibrary((lib, now) => toggleSaved(lib, id, now));
}

/** Saved look IDs, newest first. `null` on the server, before hydration and until sign-in has resolved. */
export function useSavedLooks(): string[] | null {
  const lib = useLibrary();
  return useMemo(() => (lib ? lib.saved.map((s) => s.lookId) : null), [lib]);
}
