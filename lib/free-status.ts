"use client";

import { useEffect, useSyncExternalStore } from "react";
import type { Vendor } from "./ai-vendors";

/** How many free try-ons this connection has left (GET /api/tryon/free), shared by the gate and the studio. */
export type FreeStatus = { enabled: boolean; remaining: number; perIp: number; vendor: Vendor | null };

let status: FreeStatus | null = null;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

export function refreshFreeStatus() {
  loading = fetch("/api/tryon/free", { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : null))
    .then((s: FreeStatus | null) => {
      status = s;
      notify();
    })
    .catch(() => {})
    .finally(() => {
      loading = null;
    });
  return loading;
}

/** After a free render the server says how many are left; no extra request needed. */
export function setFreeRemaining(remaining: number) {
  if (status) {
    status = { ...status, remaining };
    notify();
  }
}

export function useFreeStatus(): FreeStatus | null {
  useEffect(() => {
    if (!status && !loading) void refreshFreeStatus();
  }, []);
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => void listeners.delete(l);
    },
    () => status,
    () => null,
  );
}
