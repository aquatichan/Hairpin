"use client";

import { useLayoutEffect, useRef, useState } from "react";

/** Column count for a container width: 2 on phones up to 6 on ultrawide. */
export function columnsFor(width: number) {
  if (width < 600) return 2;
  if (width < 900) return 3;
  if (width < 1250) return 4;
  if (width < 1700) return 5;
  return 6;
}

/**
 * Pinterest-style masonry. Each item goes into the currently shortest column, using its known aspect ratio, so the
 * ranking reads in order across the top and nothing jumps when images load. `ratio` is height / width.
 */
export function MasonryColumns<T>({
  items,
  ratio,
  getKey,
  render,
  label,
  gap = 12,
}: {
  items: T[];
  ratio: (item: T) => number;
  getKey: (item: T) => string;
  render: (item: T, index: number) => React.ReactNode;
  label: string;
  gap?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [cols, setCols] = useState(2);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const apply = () => setCols(columnsFor(el.clientWidth));
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const columns: { item: T; index: number }[][] = Array.from({ length: cols }, () => []);
  const heights = new Array<number>(cols).fill(0);
  items.forEach((item, index) => {
    let c = 0;
    for (let i = 1; i < cols; i++) if (heights[i] < heights[c] - 0.01) c = i;
    columns[c].push({ item, index });
    // Ratio plus a little for the gap, in column-width units.
    heights[c] += ratio(item) + 0.08;
  });

  return (
    <div ref={ref} role="list" aria-label={label} className="flex items-start" style={{ gap }}>
      {columns.map((col, c) => (
        <div key={c} className="flex min-w-0 flex-1 flex-col" style={{ gap }}>
          {col.map(({ item, index }) => (
            <div role="listitem" key={getKey(item)} className="min-w-0">
              {render(item, index)}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
