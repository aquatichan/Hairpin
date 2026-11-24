"use client";

import { useCallback, useEffect, useState } from "react";
import { authHeader } from "@/lib/api-client";
import type { PublicPost } from "@/lib/posts-model";
import { Button } from "../ui/button";
import { Notice } from "../ui/notice";
import { Page } from "../ui/page";
import { PageHeader } from "../ui/page-header";

type Item = PublicPost & { status: string };
type Usage = { bytes: number; approved: number; pending: number; softLimit: number };
type Load = { stage: "loading" } | { stage: "forbidden" } | { stage: "error"; message: string } | { stage: "ready"; queue: Item[]; usage: Usage };

const mb = (n: number) => `${(n / 1_000_000).toFixed(1)} MB`;

/** Review queue for shared cuts. The server refuses anyone not listed in HAIRPIN_ADMIN_UIDS, whatever this page shows. */
export function ReviewQueue() {
  const [state, setState] = useState<Load>({ stage: "loading" });
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/posts", { headers: await authHeader(), cache: "no-store" });
      if (res.status === 403) return setState({ stage: "forbidden" });
      const body = await res.json().catch(() => null);
      if (!res.ok) return setState({ stage: "error", message: body?.error?.message ?? "Couldn't load the queue." });
      setState({ stage: "ready", queue: body.queue, usage: body.usage });
    } catch {
      setState({ stage: "error", message: "You seem to be offline." });
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  async function act(id: string, action: "approve" | "reject" | "remove") {
    setBusy(id);
    try {
      const res = await fetch("/api/admin/posts", { method: "POST", headers: { ...(await authHeader()), "Content-Type": "application/json" }, body: JSON.stringify({ id, action }) });
      if (!res.ok) throw new Error();
      await load();
    } catch {
      setState({ stage: "error", message: "That didn't go through. Try again." });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Page>
      <PageHeader eyebrow="Reviewers" title={<>Shared <em className="accent-word">cuts</em></>} description="Nothing a member shares is shown to anyone else until you approve it. Held cuts were reported by three different people." />
      {state.stage === "loading" && <p className="text-body text-stone">Loading the queue…</p>}
      {state.stage === "forbidden" && <Notice>This page is only for reviewers.</Notice>}
      {state.stage === "error" && (
        <div className="flex flex-col gap-3">
          <Notice tone="error">{state.message}</Notice>
          <Button variant="ghost" className="self-start" onClick={() => void load()}>
            Try again
          </Button>
        </div>
      )}
      {state.stage === "ready" && (
        <>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["Waiting", String(state.usage.pending)],
              ["Live", String(state.usage.approved)],
              ["Stored", mb(state.usage.bytes)],
              ["Pauses at", mb(state.usage.softLimit)],
            ].map(([k, v]) => (
              <div key={k} className="surface flex flex-col gap-1 rounded-card p-4">
                <dt className="text-caption tracking-widest text-stone uppercase">{k}</dt>
                <dd className="font-serif text-title">{v}</dd>
              </div>
            ))}
          </dl>
          {state.queue.length === 0 ? (
            <p className="text-body text-stone">Nothing is waiting for review.</p>
          ) : (
            <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {state.queue.map((p) => (
                <li key={p.id} className="surface flex flex-col gap-3 rounded-[var(--r-tile)] p-4">
                  {/* eslint-disable-next-line @next/next/no-img-element -- reviewer view of a stored photo */}
                  <img src={p.image} alt={p.name} className="aspect-[4/5] w-full rounded-card bg-graphite object-contain" />
                  <div className="flex flex-col gap-1">
                    <p className="flex items-center justify-between gap-2 font-serif text-title">
                      {p.name}
                      {p.status === "held" && <span className="rounded-full border border-champagne/50 px-2 py-0.5 text-caption text-champagne">Held</span>}
                    </p>
                    <p className="text-body text-stone">{p.description || "No description."}</p>
                    <p className="text-caption text-stone">
                      {p.audience} · {p.length} · {p.hairType.toUpperCase()} · {p.tags.join(", ") || "no tags"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button disabled={busy === p.id} onClick={() => act(p.id, "approve")}>
                      Approve
                    </Button>
                    <Button variant="ghost" disabled={busy === p.id} onClick={() => act(p.id, "reject")}>
                      Reject
                    </Button>
                    <Button variant="ghost" disabled={busy === p.id} onClick={() => act(p.id, "remove")}>
                      Remove
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Page>
  );
}
