"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { dismissReady, useRenderTracker } from "@/lib/render-tracker";
import { CloseIcon } from "./ui/icons";

/** Outside the studio: a small pill while a try-on is being made in this tab, then a link to it when it's ready. */
export function RenderStatus() {
  const { pending, ready } = useRenderTracker();
  const pathname = usePathname();
  const onTry = pathname.startsWith("/try");
  // A try-on that finished in front of the person, in the studio, needs no "ready" notice later.
  useEffect(() => {
    if (onTry && ready) dismissReady();
  }, [onTry, ready]);
  if (onTry) return null;
  if (!pending && !ready) return null;
  return (
    <div
      role="status"
      className="fixed right-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] left-4 z-30 mx-auto flex max-w-sm items-center gap-3 rounded-full border border-champagne/40 bg-graphite/95 py-2 pr-2 pl-4 text-body shadow-2xl shadow-onyx backdrop-blur-md lg:right-8 lg:bottom-8 lg:left-auto"
    >
      {pending ? (
        <>
          <span aria-hidden className="size-2 shrink-0 animate-pulse rounded-full bg-champagne" />
          <span className="min-w-0 flex-1">Making your try-on. Keep this tab open.</span>
        </>
      ) : (
        ready && (
          <>
            <span aria-hidden className="size-2 shrink-0 rounded-full bg-champagne" />
            <span className="min-w-0 flex-1 truncate">Try-on ready: {ready.label}</span>
            <Link href={`/brief?render=${ready.id}`} onClick={dismissReady} className="shrink-0 rounded-full bg-champagne px-3 py-1.5 text-caption font-medium text-onyx hover:bg-champagne-light">
              View
            </Link>
            <button type="button" onClick={dismissReady} aria-label="Dismiss" className="grid size-8 shrink-0 place-items-center rounded-full text-stone hover:text-ivory">
              <CloseIcon />
            </button>
          </>
        )
      )}
    </div>
  );
}
