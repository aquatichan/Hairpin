"use client";

import Link from "next/link";
import { localStore } from "@/lib/local-store";
import { useLocal } from "@/lib/use-local";
import { BlobImage } from "@/components/ui/blob-image";
import { buttonClass } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";

const remove = "text-caption text-stone underline underline-offset-4 hover:text-ivory";

export default function Saved() {
  const data = useLocal(async () => ({ renders: await localStore.list("renders"), briefs: await localStore.list("briefs") }), "saved");

  if (!data) return <div className="grid grid-cols-2 gap-2 p-4 md:grid-cols-4"><Skeleton className="aspect-[4/5]" /><Skeleton className="aspect-[4/5]" /></div>;
  if (!data.renders.length && !data.briefs.length) {
    return (
      <EmptyState title="Nothing saved yet" body="Your renders and Barber Briefs will live here.">
        <Link href="/discover" className={buttonClass("primary")}>
          Browse looks
        </Link>
      </EmptyState>
    );
  }

  return (
    <div className="flex flex-col gap-8 px-4 py-6 lg:px-8">
      {data.briefs.length > 0 && (
        <section className="flex flex-col gap-4">
          <h2 className="font-serif text-title">Barber Briefs</h2>
          <ul className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:gap-4 xl:grid-cols-4">
            {data.briefs.map((b) => (
              <li key={b.id} className="flex flex-col gap-2">
                <Link href={`/brief?id=${b.id}`} className="flex aspect-[4/5] flex-col justify-between rounded-card bg-ivory p-4 text-onyx">
                  <span className="text-caption font-semibold tracking-widest text-onyx/60 uppercase">Barber Brief</span>
                  <span className="font-serif text-title">{b.brief.styleName}</span>
                </Link>
                <button type="button" className={`${remove} self-start`} onClick={() => localStore.remove("briefs", b.id)}>
                  Delete
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {data.renders.length > 0 && (
        <section className="flex flex-col gap-4">
          <h2 className="font-serif text-title">Renders</h2>
          <ul className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:gap-4 xl:grid-cols-4">
            {data.renders.map((r) => (
              <li key={r.id} className="flex flex-col gap-2">
                <Link href={`/brief?render=${r.id}`} aria-label={`Open ${r.lookName}`}>
                  <BlobImage blob={r.result} alt={`${r.lookName}${r.mock ? " (demo, not an AI render)" : ""}`} />
                </Link>
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-body font-medium">
                    {r.lookName}
                    {r.tweak ? ` · ${r.tweak}` : ""}
                    {r.mock ? " · Demo" : ""}
                  </p>
                  <button type="button" className={remove} onClick={() => localStore.remove("renders", r.id)}>
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
