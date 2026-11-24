"use client";

import { useSyncExternalStore } from "react";
import { subscribeScope } from "./account-scope";
import { communityById } from "./community";
import { curatedIds, libraryLooks, type Look } from "./looks";
import { localStore, type StoredCut } from "./local-store";
import { textureOf } from "./hair-types";

/**
 * The person's own cuts as `Look`s, so Discover, Saved and Try treat them like any other look. They live in this
 * account's on-device database (IndexedDB `cuts`), with ids "m-<uuid>"; the image is shown from an object URL.
 */
let cuts: StoredCut[] = [];
let looks: Look[] = [];
let blobs = new Map<string, Blob>();
/** Post ids of cuts this device has shared publicly, so the feed doesn't show the person their own cut twice. */
let shared = new Set<string>();
const urls = new Map<string, { url: string; stamp: number }>();
const listeners = new Set<() => void>();
let started = false;

function toLook(c: StoredCut): Look {
  let u = urls.get(c.id);
  if (!u || u.stamp !== c.createdAt) {
    if (u) URL.revokeObjectURL(u.url);
    u = { url: URL.createObjectURL(c.image), stamp: c.createdAt };
    urls.set(c.id, u);
  }
  return {
    id: c.id,
    name: c.name,
    notes: c.description,
    image: u.url,
    ratio: c.height / c.width,
    alt: c.name,
    length: c.length,
    texture: c.hairType ? textureOf(c.hairType) : "straight",
    hairType: c.hairType ?? undefined,
    audience: c.audience,
    tags: c.tags,
    faceShapes: [],
    source: "mine",
    createdAt: c.createdAt,
  };
}

async function refresh() {
  try {
    cuts = await localStore.list("cuts");
  } catch {
    cuts = [];
  }
  const live = new Set(cuts.map((c) => c.id));
  for (const [id, u] of urls) {
    if (!live.has(id)) {
      URL.revokeObjectURL(u.url);
      urls.delete(id);
    }
  }
  blobs = new Map(cuts.map((c) => [c.id, c.image]));
  shared = new Set(cuts.flatMap((c) => (c.shared ? [c.shared.postId] : [])));
  looks = cuts.map(toLook);
  listeners.forEach((l) => l());
}

function start() {
  if (started || typeof window === "undefined") return;
  started = true;
  void refresh();
  localStore.subscribe(() => void refresh());
  // A different account means a different database: drop everything from the last one first.
  subscribeScope(() => {
    cuts = [];
    looks = [];
    listeners.forEach((l) => l());
    void refresh();
  });
}

const subscribe = (l: () => void) => {
  start();
  listeners.add(l);
  return () => void listeners.delete(l);
};
const EMPTY: Look[] = [];

/** This account's own cuts, newest first. Empty on the server. */
export function useMyLooks(): Look[] {
  return useSyncExternalStore(subscribe, () => looks, () => EMPTY);
}

/** The whole stored cut (for editing or deleting). */
export const getCut = (id: string) => cuts.find((c) => c.id === id) ?? null;
/** The original blob of one of the person's cuts, e.g. to use as a Try reference. */
export const cutBlob = (id: string) => blobs.get(id) ?? null;

const curated = new Map(libraryLooks.map((l) => [l.id, l]));
/** A look by id: curated first, then this device's own cuts. Undefined if neither has it. */
export const lookById = (id: string): Look | undefined => curated.get(id) ?? looks.find((l) => l.id === id) ?? communityById(id);
/** True for a community post the person shared from this device (they already see it as one of their own cuts). */
export const isMyShared = (postId: string) => shared.has(postId);
export const isCuratedId = (id: string) => curatedIds.has(id);
