"use client";

import { useEffect, useRef } from "react";
import { lastPointer } from "@/lib/fx";

/**
 * A modal sheet: slides up from the bottom on phones, a centred card on desktop that grows out of the point that
 * opened it. Built on <dialog> for focus trapping and Escape. On phones the handle can be dragged: down past a
 * threshold closes it, up stretches with rubber-band resistance and springs back on release.
 */
export function BottomSheet({
  open,
  onClose,
  label,
  labelledBy,
  size = "default",
  children,
}: {
  open: boolean;
  onClose: () => void;
  label: string;
  /** ID of a visible heading inside the sheet; preferred over `label` when given. */
  labelledBy?: string;
  size?: "default" | "wide";
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const drag = useRef<{ y: number; id: number } | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      // Grow out of the press that opened it (desktop); keyboard opens fall back to the centre.
      const p = lastPointer();
      const r = dialog.getBoundingClientRect();
      dialog.style.transformOrigin = p ? `${p.x - r.left}px ${p.y - r.top}px` : "50% 50%";
    }
    if (!open && dialog.open) dialog.close();
    // Also close when the page is hidden or unmounted, so a kept-alive page never leaves the app inert.
    return () => {
      if (dialog.open) dialog.close();
    };
  }, [open]);

  function onHandleDown(e: React.PointerEvent) {
    drag.current = { y: e.clientY, id: e.pointerId };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    if (ref.current) ref.current.style.transition = "none";
  }
  function onHandleMove(e: React.PointerEvent) {
    const d = drag.current;
    const dialog = ref.current;
    if (!d || !dialog || d.id !== e.pointerId) return;
    const dy = e.clientY - d.y;
    // Down follows the finger; up resists more the further it goes.
    const y = dy >= 0 ? dy : -Math.sqrt(-dy) * 4;
    dialog.style.transform = `translateY(${y}px) scaleY(${dy < 0 ? 1 + Math.min(0.04, -dy / 4000) : 1})`;
  }
  function onHandleUp(e: React.PointerEvent) {
    const d = drag.current;
    const dialog = ref.current;
    drag.current = null;
    if (!d || !dialog) return;
    const dy = e.clientY - d.y;
    dialog.style.transition = "transform 320ms var(--ease-spring)";
    if (dy > 120) {
      dialog.style.transform = "translateY(100%)";
      window.setTimeout(() => {
        dialog.style.transform = "";
        dialog.style.transition = "";
        onClose();
      }, 180);
    } else {
      dialog.style.transform = "";
    }
  }

  return (
    <dialog
      ref={ref}
      aria-label={labelledBy ? undefined : label}
      aria-labelledby={labelledBy}
      // A close the sheet made itself (cleanup, including React's development double-mount) can fire after it has
      // re-opened; only a dialog that is actually closed now counts as the person closing it.
      onClose={(e) => {
        if (!e.currentTarget.open) onClose();
      }}
      onClick={(e) => e.target === ref.current && onClose()}
      className={`origin-aware m-0 mt-auto max-h-[90dvh] w-full max-w-none overflow-y-auto rounded-t-[var(--r-panel)] border border-hairline bg-graphite bg-[image:linear-gradient(180deg_in_oklch,color-mix(in_oklch,var(--color-champagne)_8%,transparent),transparent_38%)] p-0 text-ivory backdrop:bg-onyx/80 open:animate-sheet backdrop:animate-fade lg:m-auto lg:rounded-[var(--r-panel)] ${size === "wide" ? "lg:max-w-5xl" : "lg:max-w-md"}`}
    >
      {open && (
        <>
          <div
            aria-hidden
            onPointerDown={onHandleDown}
            onPointerMove={onHandleMove}
            onPointerUp={onHandleUp}
            onPointerCancel={onHandleUp}
            className="sticky top-0 z-10 flex h-6 cursor-grab touch-none justify-center pt-2 active:cursor-grabbing lg:hidden"
          >
            <span className="h-1 w-10 rounded-full bg-ivory/25" />
          </div>
          <div className="flex flex-col gap-4 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] lg:p-6">{children}</div>
        </>
      )}
    </dialog>
  );
}
