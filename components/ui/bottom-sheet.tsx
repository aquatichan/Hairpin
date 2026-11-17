"use client";

import { useEffect, useRef } from "react";

/** A modal sheet: slides up from the bottom on phones, centered card on desktop. Built on <dialog> for focus trapping and Escape. */
export function BottomSheet({ open, onClose, label, children }: { open: boolean; onClose: () => void; label: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
    // Also close when the page is hidden or unmounted, so a kept-alive page never leaves the app inert.
    return () => {
      if (dialog.open) dialog.close();
    };
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-label={label}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className="m-0 mt-auto max-h-[90dvh] w-full max-w-none overflow-y-auto rounded-t-card border border-hairline bg-graphite p-0 text-ivory backdrop:bg-onyx/80 lg:m-auto lg:max-w-md lg:rounded-card"
    >
      {open && <div className="flex flex-col gap-4 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">{children}</div>}
    </dialog>
  );
}
