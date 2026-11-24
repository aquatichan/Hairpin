"use client";

import Image from "next/image";
import type { Look } from "@/lib/looks";
import { BottomSheet } from "../ui/bottom-sheet";
import { CloseIcon } from "../ui/icons";

/** Choose a Discover look for the studio. */
export function LookPicker({
  open,
  looks,
  selectedId,
  onPick,
  onClose,
}: {
  open: boolean;
  looks: Look[];
  selectedId: string | null;
  onPick: (look: Look) => void;
  onClose: () => void;
}) {
  return (
    <BottomSheet open={open} onClose={onClose} label="Choose a look" labelledBy="look-picker-title" size="wide">
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 id="look-picker-title" className="font-serif text-title">
              Choose a look
            </h2>
            <p className="text-caption text-stone">Illustrative AI portraits, used as hairstyle references.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="grid size-10 shrink-0 place-items-center rounded-full border border-hairline hover:bg-graphite">
            <CloseIcon />
          </button>
        </div>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {looks.map((look) => {
            const selected = look.id === selectedId;
            return (
              <li key={look.id}>
                <button
                  type="button"
                  onClick={() => onPick(look)}
                  aria-pressed={selected}
                  className={`group flex w-full flex-col gap-2 rounded-card text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-champagne-light`}
                >
                  <span className={`relative block aspect-[3/4] w-full overflow-hidden rounded-card border bg-graphite ${selected ? "border-champagne" : "border-hairline group-hover:border-stone/50"}`}>
                    <Image src={look.image} alt="" fill sizes="(max-width: 640px) 45vw, 200px" className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03]" />
                    {selected && <span className="absolute top-2 left-2 rounded-full bg-champagne px-2 py-0.5 text-caption font-medium text-onyx">Selected</span>}
                  </span>
                  <span className="flex flex-col">
                    <span className="text-body font-medium">{look.name}</span>
                    <span className="text-caption text-stone capitalize">
                      {look.length} · {look.texture}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </BottomSheet>
  );
}
