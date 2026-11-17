"use client";

import { useEffect, useState } from "react";
import { localStore } from "./local-store";

/** Loads from the on-device store and reloads whenever it changes. `undefined` means still loading. */
export function useLocal<T>(load: () => Promise<T>, key: string): T | undefined {
  const [state, setState] = useState<{ key: string; value: T } | undefined>();
  useEffect(() => {
    let live = true;
    const refresh = () => load().then((value) => live && setState({ key, value }), () => {});
    refresh();
    const unsubscribe = localStore.subscribe(refresh);
    return () => {
      live = false;
      unsubscribe();
    };
    // `load` is identified by `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state?.key === key ? state.value : undefined;
}

/** An object URL for a blob, revoked when the blob changes or the component unmounts. */
export function useBlobUrl(blob: Blob | null | undefined) {
  const [entry, setEntry] = useState<{ blob: Blob; url: string } | null>(null);
  useEffect(() => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    queueMicrotask(() => setEntry({ blob, url }));
    return () => URL.revokeObjectURL(url);
  }, [blob]);
  return blob && entry?.blob === blob ? entry.url : null;
}
