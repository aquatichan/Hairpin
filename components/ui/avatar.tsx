"use client";

import { useState } from "react";

/** The person's Google photo when there is one (and it loads), otherwise a gold monogram of their initials. */
export function initialsOf(name: string | null | undefined) {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

export function Avatar({ name, photoUrl, className = "size-10", textClass = "text-lead" }: { name: string | null | undefined; photoUrl: string | null | undefined; className?: string; textClass?: string }) {
  const [failed, setFailed] = useState(false);
  const initials = initialsOf(name);
  return (
    <span className={`relative grid shrink-0 place-items-center overflow-hidden rounded-full border border-champagne/50 bg-linear-to-b/oklch from-slate to-graphite ${className}`}>
      <span aria-hidden className={`font-serif text-champagne ${textClass}`}>
        {initials || "H"}
      </span>
      {photoUrl && !failed && (
        // eslint-disable-next-line @next/next/no-img-element -- the account's own Google avatar, a remote URL we don't proxy
        <img src={photoUrl} alt="" referrerPolicy="no-referrer" onError={() => setFailed(true)} className="absolute inset-0 size-full object-cover" />
      )}
    </span>
  );
}
