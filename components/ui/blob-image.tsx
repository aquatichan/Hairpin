"use client";

import { useBlobUrl } from "@/lib/use-local";

/** Fixed-aspect frame for an on-device image. */
export function BlobImage({ blob, alt, className = "aspect-[4/5]" }: { blob: Blob; alt: string; className?: string }) {
  const url = useBlobUrl(blob);
  return (
    <div className={`relative overflow-hidden rounded-card bg-graphite ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- local blob URL */}
      {url && <img src={url} alt={alt} className="absolute inset-0 size-full object-cover" />}
    </div>
  );
}
