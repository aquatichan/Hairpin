"use client";

import Image from "next/image";
import { useState } from "react";
import { FAMILIES, HAIR_TYPE_INFO, familyOf, hairTypeImage, hairTypeLabel, typesIn, type HairFamily, type HairType } from "@/lib/hair-types";

const FAMILY_SAMPLE: Record<HairFamily, HairType> = { "1": "1b", "2": "2b", "3": "3b", "4": "4b" };

/**
 * Pick a hair type in two small steps: the family (4 choices), then the pattern inside it (3 choices). Fewer options
 * at once makes the choice faster, and each tile shows the real pattern.
 */
export function HairTypePicker({ value, onChange, compact = false }: { value: HairType | null; onChange: (t: HairType) => void; compact?: boolean }) {
  const [picked, setFamily] = useState<HairFamily | null>(null);
  // Follows the saved value (which can arrive after the first render) until the person picks a family themselves.
  const family = picked ?? (value ? familyOf(value) : null);

  return (
    <div className="flex flex-col gap-4">
      <div role="radiogroup" aria-label="Hair family" className="grid grid-cols-4 gap-2 sm:gap-3">
        {FAMILIES.map((f, i) => {
          const on = family === f.id;
          return (
            <button
              key={f.id}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={`${f.label}, ${f.blurb.toLowerCase()}`}
              onClick={() => setFamily(f.id)}
              style={{ "--i": i } as React.CSSProperties}
              className={`press stagger-in group relative flex flex-col overflow-hidden rounded-[var(--r-tile)] border text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-champagne-light ${
                on ? "border-champagne shadow-[0_0_0_1px_var(--color-champagne)]" : "border-hairline hover:border-champagne/40"
              }`}
            >
              <span className={`relative block w-full ${compact ? "aspect-square" : "aspect-[4/5]"}`}>
                <Image src={hairTypeImage(FAMILY_SAMPLE[f.id])} alt="" fill sizes="(min-width: 1024px) 160px, 24vw" className={`object-cover transition-[transform,filter] duration-300 ease-out group-hover:scale-105 ${family && !on ? "brightness-50" : ""}`} />
                <span aria-hidden className="absolute inset-x-0 bottom-0 h-2/3 bg-linear-to-t/oklch from-onyx/90 to-transparent" />
                <span aria-hidden className="absolute bottom-2 left-2 font-mono text-caption text-champagne">{f.id}</span>
              </span>
              <span className="px-2 py-2 text-body font-medium sm:px-3">{f.label}</span>
            </button>
          );
        })}
      </div>

      {family && (
        <div role="radiogroup" aria-label="Hair pattern" className="grid grid-cols-3 gap-2 sm:gap-3" key={family}>
          {typesIn(family).map((t, i) => {
            const on = value === t;
            return (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={on}
                aria-label={`${hairTypeLabel(t)}, ${HAIR_TYPE_INFO[t].name}`}
                onClick={() => onChange(t)}
                style={{ "--i": i } as React.CSSProperties}
                className={`press stagger-in group relative flex items-center gap-3 overflow-hidden rounded-[var(--r-tile)] border p-2 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-champagne-light ${
                  on ? "surface-raised border-champagne" : "border-hairline hover:border-champagne/40"
                }`}
              >
                <span className="relative size-14 shrink-0 overflow-hidden rounded-[calc(var(--r-tile)-0.5rem)] sm:size-16">
                  <Image src={hairTypeImage(t)} alt="" fill sizes="64px" className="object-cover" />
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className={`font-mono text-lead ${on ? "text-champagne" : ""}`}>{hairTypeLabel(t)}</span>
                  <span className="truncate text-caption text-stone">{HAIR_TYPE_INFO[t].name}</span>
                </span>
                {on && <span aria-hidden className="pop-in absolute top-2 right-2 size-2 rounded-full bg-champagne" />}
              </button>
            );
          })}
        </div>
      )}
      {value && <p className="text-caption text-stone">{HAIR_TYPE_INFO[value].blurb}</p>}
    </div>
  );
}
