"use client";

import { getAccountScope, scopedKey } from "./account-scope";
import { authHeader } from "./api-client";
import { localStore } from "./local-store";

export type DeleteStep = "server" | "device" | "auth";

/**
 * Account deletion, in order: the server records (DELETE /api/account), then this device's copy, then the caller
 * deletes the Firebase account. Each step can be retried: deleting again is harmless.
 */
export async function deleteAccountData(): Promise<{ ok: true } | { ok: false; step: DeleteStep; message: string }> {
  const scope = getAccountScope();
  if (!scope) return { ok: false, step: "server", message: "Please sign in again first." };
  try {
    const res = await fetch("/api/account", { method: "DELETE", headers: await authHeader(), cache: "no-store" });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      return { ok: false, step: "server", message: body?.error?.message ?? "Your account data couldn't be deleted. Please try again." };
    }
  } catch {
    return { ok: false, step: "server", message: "You seem to be offline. Nothing was deleted; try again when you're connected." };
  }
  try {
    await localStore.clearAll();
    for (const base of ["hairpin:profile", "hairpin.ai-choice", "hairpin:library", "hairpin:taste"]) {
      const key = scopedKey(base, scope);
      if (key) localStorage.removeItem(key);
    }
  } catch {
    return { ok: false, step: "device", message: "Your server data is deleted, but this device's copy couldn't be cleared. Clear site data for Hairpin in your browser settings." };
  }
  return { ok: true };
}
