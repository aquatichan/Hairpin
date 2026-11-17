"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { Look } from "@/lib/looks";
import { useProfile } from "@/lib/profile";
import { BottomSheet } from "./ui/bottom-sheet";
import { buttonClass } from "./ui/button";
import { Chip } from "./ui/chip";
import { MoreIcon, SearchIcon } from "./ui/icons";

const filters = ["All", "Short", "Medium", "Long", "Straight", "Wavy", "Curly", "Coily"] as const;

export function Masonry({ looks }: { looks: Look[] }) {
  const [filter, setFilter] = useState<(typeof filters)[number]>("All");
  const [open, setOpen] = useState<Look | null>(null);
  const [query, setQuery] = useState("");
  const profile = useProfile();
  const tryHref = (look: Look) => {
    const target = `/try?look=${look.id}`;
    // The first time someone goes to try a look, the short intro runs first.
    return profile && profile.onboardedAt === null ? `/welcome?next=${encodeURIComponent(target)}` : target;
  };
  const shown = useMemo(() => {
    const f = filter.toLowerCase();
    const q = query.trim().toLowerCase();
    return looks.filter((l) => (filter === "All" || l.length === f || l.texture === f) && (!q || `${l.name} ${l.length} ${l.texture}`.toLowerCase().includes(q)));
  }, [looks, filter, query]);

  return (
    <div className="flex flex-col gap-4 px-2 py-4 lg:px-8 lg:py-6">
      {looks.length > 0 && (
      <>
      <label className="mx-2 flex h-12 items-center gap-3 rounded-full bg-graphite px-4 text-stone focus-within:text-ivory lg:mx-0 lg:max-w-md">
        <SearchIcon />
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search cuts" aria-label="Search cuts" className="h-full min-w-0 flex-1 bg-transparent text-body text-ivory placeholder:text-stone focus:outline-none" />
      </label>
      <div className="flex gap-2 overflow-x-auto px-2 lg:px-0" role="group" aria-label="Filter looks">
        {filters.map((f) => (
          <Chip key={f} selected={f === filter} onClick={() => setFilter(f)}>
            {f}
          </Chip>
        ))}
      </div>
      </>
      )}
      {/* CSS columns give the staggered masonry flow with no layout script. */}
      <ul className="columns-2 gap-2 md:columns-3 lg:gap-4 xl:columns-4 2xl:columns-5">
        {shown.map((look, i) => (
          <li key={look.id} className="group mb-2 animate-rise break-inside-avoid lg:mb-4" style={{ animationDelay: `${Math.min(i, 10) * 40}ms` }}>
            <button type="button" onClick={() => setOpen(look)} aria-label={`Open ${look.name}`} className="relative block w-full overflow-hidden rounded-card bg-graphite" style={{ aspectRatio: `1 / ${look.ratio}` }}>
              <Image src={look.image} alt={look.name} fill sizes="(min-width: 1280px) 20vw, (min-width: 768px) 33vw, 50vw" className="object-cover transition-transform duration-500 ease-out group-hover:scale-105" priority={i < 4} />
            </button>
            <div className="flex items-center justify-between gap-2 px-2 pt-2">
              <p className="truncate text-body font-medium">{look.name}</p>
              <button type="button" onClick={() => setOpen(look)} aria-label={`More options for ${look.name}`} className="shrink-0 text-stone hover:text-ivory">
                <MoreIcon />
              </button>
            </div>
          </li>
        ))}
      </ul>
      <BottomSheet open={open !== null} onClose={() => setOpen(null)} label={open?.name ?? "Look"}>
        {open && (
          <>
            <div className="relative aspect-[4/5] overflow-hidden rounded-card bg-slate">
              <Image src={open.image} alt={open.name} fill sizes="448px" className="object-cover" />
            </div>
            <div className="flex flex-col gap-1">
              <h2 className="font-serif text-title">{open.name}</h2>
              <p className="text-caption tracking-widest text-stone uppercase">
                {open.length} · {open.texture}
              </p>
              {open.notes && <p className="pt-2 text-body text-stone">{open.notes}</p>}
              {open.credit && (
                <p className="pt-2 text-caption text-stone">
                  Photo:{" "}
                  {open.creditUrl ? (
                    <a href={open.creditUrl} target="_blank" rel="noreferrer" className="underline underline-offset-4 hover:text-ivory">
                      {open.credit}
                    </a>
                  ) : (
                    open.credit
                  )}
                </p>
              )}
            </div>
            <Link href={tryHref(open)} onClick={() => setOpen(null)} className={buttonClass("primary")}>
              Try on me
            </Link>
          </>
        )}
      </BottomSheet>
      {looks.length === 0 ? (
        <LibraryComingSoon />
      ) : (
        shown.length === 0 && <p className="px-2 py-12 text-center text-body text-stone">No looks match that filter yet.</p>
      )}
    </div>
  );
}

const PLACEHOLDER_RATIOS = [1.3, 1.6, 1.1, 1.45, 1.25, 1.55, 1.15, 1.4];

/** Shown until real photos are added: the shape of the gallery, honestly labelled. */
function LibraryComingSoon() {
  return (
    <div className="relative">
      <ul className="columns-2 gap-2 md:columns-3 lg:gap-4 xl:columns-4 2xl:columns-5" aria-hidden>
        {PLACEHOLDER_RATIOS.concat(PLACEHOLDER_RATIOS).map((ratio, i) => (
          <li key={i} className="mb-2 break-inside-avoid lg:mb-4">
            <div className="animate-pulse rounded-card bg-graphite" style={{ aspectRatio: `1 / ${ratio}`, animationDelay: `${i * 90}ms` }} />
          </li>
        ))}
      </ul>
      <div className="absolute inset-x-0 top-16 flex justify-center px-4">
        <div className="flex max-w-sm flex-col items-center gap-3 rounded-card border border-hairline bg-onyx px-6 py-8 text-center">
          <h2 className="font-serif text-title">The library is being stocked</h2>
          <p className="text-body text-stone">Real haircut photos land here soon. Meanwhile, you can try any cut from a screenshot.</p>
          <Link href="/decode" className={buttonClass("primary")}>
            Decode a screenshot
          </Link>
        </div>
      </div>
    </div>
  );
}
