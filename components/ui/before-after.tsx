"use client";

import { useState } from "react";

/** Drag or use the arrow keys to wipe between two images. The range input covers the frame, so it is keyboard and screen-reader accessible. */
export function BeforeAfter({
  before,
  after,
  label,
  beforeLabel = "Before",
  afterLabel = "After",
  beforeAlt = "Before",
  afterAlt = "After",
}: {
  before: string;
  after: string;
  label: string;
  beforeLabel?: string;
  afterLabel?: string;
  beforeAlt?: string;
  afterAlt?: string;
}) {
  const [split, setSplit] = useState(50);
  return (
    <div className="relative aspect-[4/5] w-full overflow-hidden rounded-card bg-graphite">
      {/* eslint-disable-next-line @next/next/no-img-element -- local blob URLs */}
      <img src={after} alt={afterAlt} className="absolute inset-0 size-full object-cover" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={before} alt={beforeAlt} className="absolute inset-0 size-full object-cover" style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }} />
      <div className="pointer-events-none absolute inset-y-0 w-px bg-ivory" style={{ left: `${split}%` }}>
        <span className="absolute top-1/2 left-1/2 size-8 -translate-1/2 rounded-full border border-onyx bg-ivory" />
      </div>
      <span className="pointer-events-none absolute top-3 left-3 rounded-full bg-onyx/80 px-3 py-1 text-caption">{beforeLabel}</span>
      <span className="pointer-events-none absolute top-3 right-3 rounded-full bg-onyx/80 px-3 py-1 text-caption">{afterLabel}</span>
      <input
        type="range"
        min={0}
        max={100}
        value={split}
        onChange={(e) => setSplit(Number(e.target.value))}
        aria-label={label}
        aria-valuetext={`${split}% ${beforeLabel.toLowerCase()} shown`}
        className="absolute inset-0 size-full cursor-ew-resize opacity-0"
      />
    </div>
  );
}
