"use client";

import { useEffect, useState } from "react";
import { useAccountScope, DEVICE_SCOPE } from "@/lib/account-scope";
import { adoptLegacy, adoptLegacyOnPreview, discardLegacy, dropUnownedKey, legacySummary, type LegacySummary } from "@/lib/legacy-data";
import { Button } from "./ui/button";

const LATER = "hairpin.legacy-later";

function describe(s: LegacySummary) {
  const parts = [
    s.photo && "a photo",
    s.renders && `${s.renders} try-on${s.renders === 1 ? "" : "s"}`,
    s.briefs && `${s.briefs} Barber Brief${s.briefs === 1 ? "" : "s"}`,
    s.savedLooks && `${s.savedLooks} saved look${s.savedLooks === 1 ? "" : "s"}`,
    s.profile && "hair preferences",
  ].filter(Boolean) as string[];
  return parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}` : parts[0];
}

/**
 * Shown once per session to a signed-in person when this device still holds data from before accounts were kept
 * apart. Counts only, nothing is previewed, and nothing moves until they choose.
 */
export function LegacyDataPrompt() {
  const scope = useAccountScope();
  const [summary, setSummary] = useState<LegacySummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!scope) return;
    let live = true;
    (async () => {
      if (scope === DEVICE_SCOPE) return void adoptLegacyOnPreview();
      dropUnownedKey();
      let later = false;
      try {
        later = sessionStorage.getItem(LATER) === scope;
      } catch {}
      const s = later ? null : await legacySummary();
      if (live) setSummary(s);
    })();
    return () => {
      live = false;
    };
  }, [scope]);

  if (!summary || !scope || scope === DEVICE_SCOPE) return null;

  async function act(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
      setSummary(null);
    }
  }

  return (
    <section aria-labelledby="legacy-title" className="mx-4 mt-4 flex flex-col gap-3 rounded-card border border-champagne/40 bg-champagne/5 p-4 lg:mx-8">
      <h2 id="legacy-title" className="text-body font-medium">
        Found older items on this device
      </h2>
      <p className="text-body text-stone">
        This device has {describe(summary)} saved before Hairpin kept each account separate, so we can&apos;t tell whose they are. Add them to this account only
        if you saved them.
      </p>
      {confirmDelete ? (
        <div className="flex flex-wrap gap-2">
          <Button disabled={busy} onClick={() => act(discardLegacy)}>
            Yes, delete them
          </Button>
          <Button variant="ghost" disabled={busy} onClick={() => setConfirmDelete(false)}>
            Cancel
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button disabled={busy} onClick={() => act(adoptLegacy)}>
            They&apos;re mine, add them
          </Button>
          <Button variant="ghost" disabled={busy} onClick={() => setConfirmDelete(true)}>
            Delete them
          </Button>
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => {
              try {
                sessionStorage.setItem(LATER, scope);
              } catch {}
              setSummary(null);
            }}
          >
            Decide later
          </Button>
        </div>
      )}
    </section>
  );
}
