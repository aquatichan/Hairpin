"use client";

import { useSyncExternalStore } from "react";
import { subscribeScope } from "./account-scope";
import { ApiClientError, authHeader } from "./api-client";
import { localStore, type StoredCut } from "./local-store";
import type { Look } from "./looks";
import { postToLook } from "./posts-look";
import { isPostId, type PostStatus, type PublicPost } from "./posts-model";

/**
 * Community cuts on the client: the approved feed (paged), looks resolved by id for Saved and Try, and the person's own
 * posts with their review status. Uses plain fetch with only the auth header: the person's own AI key is never sent here.
 */
type State = { looks: Look[]; next: number | null; loaded: boolean; loading: boolean; unavailable: boolean };
const EMPTY_STATE: State = { looks: [], next: null, loaded: false, loading: false, unavailable: false };
type View = State & { all: Look[] };
const EMPTY_VIEW: View = { ...EMPTY_STATE, all: [] };
let state: State = EMPTY_STATE;
let view: View = EMPTY_VIEW;
let generation = 0;
const extra = new Map<string, Look>();
let mine: PublicPost[] = [];
const listeners = new Set<() => void>();
const merge = (into: Look[], more: Look[]) => {
  const have = new Set(into.map((l) => l.id));
  return [...into, ...more.filter((l) => !have.has(l.id))];
};
/** One stable snapshot per change, so React only re-renders (and the feed only re-ranks) when something changed. */
const emit = () => {
  view = { ...state, all: merge(state.looks, [...extra.values()]) };
  listeners.forEach((l) => l());
};
let started = false;

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { ...init, headers: { ...init.headers, ...(await authHeader()) }, cache: "no-store" });
  } catch {
    throw new ApiClientError("You seem to be offline. Check your connection and try again.", "offline");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiClientError(body?.error?.message ?? "Something went wrong. Please try again.", body?.error?.code ?? "unknown");
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

/** Loads the first page, or the next one. Safe to call repeatedly. */
export async function loadMoreCommunity(reset = false) {
  if (state.loading || (!reset && state.loaded && state.next === null)) return;
  const gen = generation;
  state = { ...state, loading: true };
  emit();
  try {
    const cursor = reset ? null : state.next;
    const data = await call<{ posts: PublicPost[]; next: number | null; unavailable?: boolean }>(`/api/posts${cursor !== null ? `?cursor=${cursor}` : ""}`);
    if (gen !== generation) return;
    const looks = data.posts.map(postToLook);
    state = { looks: reset ? looks : merge(state.looks, looks), next: data.next, loaded: true, loading: false, unavailable: Boolean(data.unavailable) };
  } catch {
    if (gen !== generation) return;
    state = { ...state, loading: false, loaded: true };
  }
  emit();
}

/** Fetches specific posts (for Saved and shared links) so they resolve even if they're not on a loaded page. */
export async function resolveCommunity(ids: string[]) {
  const want = ids.filter((id) => isPostId(id) && !extra.has(id) && !state.looks.some((l) => l.id === id)).slice(0, 24);
  if (!want.length) return;
  try {
    const data = await call<{ posts: PublicPost[] }>(`/api/posts?ids=${want.join(",")}`);
    for (const p of data.posts) extra.set(p.id, postToLook(p));
    emit();
  } catch {}
}

/** The person's own posts, and their status copied onto the matching private cuts on this device. */
export async function refreshMine(): Promise<PublicPost[]> {
  try {
    const data = await call<{ posts: PublicPost[] }>("/api/posts?mine=1");
    mine = data.posts;
    const cuts = await localStore.list("cuts");
    for (const c of cuts) {
      if (!c.shared) continue;
      const p = mine.find((m) => m.id === c.shared!.postId);
      // "held" (taken down by reports, awaiting review) reads as pending to the owner.
      const raw: PostStatus = p?.status ?? "pending";
      const status: StoredCut["shared"] = p ? { postId: p.id, status: raw === "held" ? "pending" : raw } : null;
      // A post that no longer exists (deleted by an admin, or never stored) stops showing as shared.
      if (JSON.stringify(status) !== JSON.stringify(c.shared)) await localStore.put("cuts", { ...c, shared: status });
    }
    emit();
  } catch {}
  return mine;
}

export type ShareResult = { ok: true; post: PublicPost } | { ok: false; message: string };

/** Shares a cut publicly (stored pending until reviewed). The private copy on this device is always kept. */
export async function shareCut(cut: StoredCut): Promise<ShareResult> {
  const form = new FormData();
  form.set("image", cut.image, "cut.webp");
  form.set("name", cut.name);
  form.set("description", cut.description);
  form.set("audience", cut.audience);
  form.set("length", cut.length);
  form.set("hairType", cut.hairType ?? "");
  form.set("tags", JSON.stringify(cut.tags));
  form.set("consent", "yes");
  try {
    const { post } = await call<{ post: PublicPost }>("/api/posts", { method: "POST", body: form });
    await localStore.put("cuts", { ...cut, shared: { postId: post.id, status: "pending" } });
    return { ok: true, post };
  } catch (e) {
    return { ok: false, message: e instanceof ApiClientError ? e.message : "Sharing didn't work. Your cut is still saved privately." };
  }
}

/** Removes a shared cut from the public library (and its stored image). */
export async function unshareCut(cut: StoredCut): Promise<boolean> {
  if (!cut.shared) return true;
  try {
    await call(`/api/posts/${cut.shared.postId}`, { method: "DELETE" });
    await localStore.put("cuts", { ...cut, shared: null });
    state = { ...state, looks: state.looks.filter((l) => l.id !== cut.shared!.postId) };
    emit();
    return true;
  } catch {
    return false;
  }
}

export async function reportCommunity(id: string): Promise<string | null> {
  try {
    await call(`/api/posts/${id}/report`, { method: "POST" });
    return null;
  } catch (e) {
    return e instanceof ApiClientError ? e.message : "That couldn't be sent. Please try again.";
  }
}

/** Counts a save toward popularity. Fire and forget: the save itself is private and already stored. */
export function countCommunitySave(id: string, on: boolean) {
  void call(`/api/posts/${id}/save`, { method: "PUT", body: JSON.stringify({ on }), headers: { "Content-Type": "application/json" } }).catch(() => {});
}

/** "Delete all my data": removes everything shared. Resolves false if it couldn't be reached. */
export async function deleteAllShared(): Promise<boolean> {
  try {
    await call("/api/posts", { method: "DELETE" });
    state = EMPTY_STATE;
    mine = [];
    extra.clear();
    emit();
    return true;
  } catch {
    return false;
  }
}

function start() {
  if (started || typeof window === "undefined") return;
  started = true;
  // A different account sees a different feed: forget the last one's pages.
  subscribeScope(() => {
    generation++;
    state = EMPTY_STATE;
    mine = [];
    extra.clear();
    emit();
  });
}

const subscribe = (l: () => void) => {
  start();
  listeners.add(l);
  return () => void listeners.delete(l);
};

/** Pages of approved community looks, plus any resolved by id. Empty until `loadMoreCommunity()` is called. */
export function useCommunity(): View {
  return useSyncExternalStore(subscribe, () => view, () => EMPTY_VIEW);
}

export const communityById = (id: string): Look | undefined => state.looks.find((l) => l.id === id) ?? extra.get(id);
export const myPosts = () => mine;
