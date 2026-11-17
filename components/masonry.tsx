"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import type { Look } from "@/lib/looks";
import { Chip } from "./ui/chip";
import { MoreIcon } from "./ui/icons";

const filters = ["All", "Short", "Medium", "Long", "Straight", "Wavy", "Curly", "Coily"] as const;

export function Masonry({ looks }: { looks: Look[] }) {
  const [filter, setFilter] = useState<(typeof filters)[number]>("All");
  const shown = useMemo(() => {
    const f = filter.toLowerCase();
    return filter === "All" ? looks : looks.filter((l) => l.length === f || l.texture === f);
  }, [looks, filter]);

  return (
    <div className="flex flex-col gap-4 px-2 py-4 lg:px-8 lg:py-6">
      <div className="flex gap-2 overflow-x-auto px-2 lg:px-0" role="group" aria-label="Filter looks">
        {filters.map((f) => (
          <Chip key={f} selected={f === filter} onClick={() => setFilter(f)}>
            {f}
          </Chip>
        ))}
      </div>
      {/* CSS columns give the staggered masonry flow with no layout script. */}
      <ul className="columns-2 gap-2 md:columns-3 lg:gap-4 xl:columns-4 2xl:columns-5">
        {shown.map((look, i) => (
          <li key={look.id} className="mb-2 break-inside-avoid lg:mb-4">
            <div className="relative overflow-hidden rounded-card bg-graphite" style={{ aspectRatio: `1 / ${look.ratio}` }}>
              <Image src={look.image} alt={`${look.name}, preview mannequin`} fill sizes="(min-width: 1280px) 20vw, (min-width: 768px) 33vw, 50vw" className="object-cover" priority={i < 4} />
            </div>
            <div className="flex items-center justify-between gap-2 px-2 pt-2">
              <p className="truncate text-body font-medium">{look.name}</p>
              <button type="button" aria-label={`More options for ${look.name}`} className="shrink-0 text-stone hover:text-ivory">
                <MoreIcon />
              </button>
            </div>
          </li>
        ))}
      </ul>
      {shown.length === 0 && <p className="px-2 py-12 text-center text-body text-stone">No looks match that filter yet.</p>}
    </div>
  );
}
