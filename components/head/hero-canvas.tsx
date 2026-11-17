"use client";

import dynamic from "next/dynamic";

const HeadScene = dynamic(() => import("./scene"), { ssr: false });

export function HeroCanvas(props: React.ComponentProps<typeof HeadScene>) {
  return (
    <div className="absolute inset-0" aria-hidden>
      <HeadScene {...props} />
    </div>
  );
}
