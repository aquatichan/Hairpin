import { getAccountScope, subscribeScope, whenScoped } from "./account-scope";
import type { BarberBrief, DecodedCut } from "./brief";
import type { Audience, StyleTag } from "./style";
import type { HairType } from "./hair-types";

/**
 * On-device storage for the person's photo, try-ons and briefs (IndexedDB). Nothing here leaves the device.
 *
 * Each account has its own database, `hairpin@<uid>` (`hairpin@device` in preview builds), so people sharing a
 * device never read each other's private images. Before Phase E everything lived in one shared database,
 * `hairpin`; that data has no known owner and is only moved into an account when the person explicitly says it is
 * theirs (see `legacy` below).
 */

export type StoredPhoto = { id: "active"; blob: Blob; consentAt: number; createdAt: number };
export type StoredRender = {
  id: string;
  lookId: string | null;
  lookName: string;
  tweak: string | null;
  result: Blob;
  /** True when the server ran in demo mode: the image is not an AI render. */
  mock: boolean;
  /** How it was made: matched from a reference image, or from a written description. Absent on renders made before Phase D. */
  mode?: "catalog-reference" | "catalog-describe" | "upload" | "text";
  /** Made during the publik two-image trial, which is not yet verified. */
  experimental?: boolean;
  latencyMs: number;
  createdAt: number;
};
export type StoredBrief = { id: string; renderId: string; brief: BarberBrief; mock: boolean; includePhoto: boolean; createdAt: number };

/** A past Decode: the (resized) image and what it was read as. Newest 12 are kept, on this device only. */
export type StoredDecode = { id: string; image: Blob; cut: DecodedCut; mock: boolean; createdAt: number };
/** A cut the person added themselves. Private on this device (id "m-...") until/unless they share it. */
export type StoredCut = {
  id: string;
  image: Blob;
  name: string;
  description: string;
  audience: Audience;
  length: "short" | "medium" | "long";
  hairType: HairType | null;
  tags: StyleTag[];
  /** Width / height of the stored image. */
  width: number;
  height: number;
  /** Set once it has been submitted for the public library. */
  shared?: { postId: string; status: "pending" | "approved" | "rejected" } | null;
  createdAt: number;
};

type Stores = { photo: StoredPhoto; renders: StoredRender; briefs: StoredBrief; decode: StoredDecode; cuts: StoredCut };
const STORES = ["photo", "renders", "briefs", "decode", "cuts"] as const;
/** The shared pre-Phase E database only ever had these. */
const LEGACY_STORES = ["photo", "renders", "briefs"] as const;
export const DECODE_KEEP = 12;
const LEGACY_DB = "hairpin";
const dbName = (scope: string) => `hairpin@${scope}`;

/** Version 2 added the `decode` and `cuts` stores. The legacy shared database is opened as it is, never upgraded. */
function openDb(name: string, upgrade = true): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const open = upgrade ? indexedDB.open(name, 2) : indexedDB.open(name);
    open.onupgradeneeded = () => {
      for (const store of STORES) if (!open.result.objectStoreNames.contains(store)) open.result.createObjectStore(store, { keyPath: "id" });
    };
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
  });
}

let current: { scope: string; db: Promise<IDBDatabase> } | null = null;

/** The database of the account in scope, waiting until sign-in has resolved. */
async function db(): Promise<{ scope: string; db: IDBDatabase }> {
  const scope = await whenScoped();
  if (!current || current.scope !== scope) {
    current?.db.then((d) => d.close(), () => {});
    current = { scope, db: openDb(dbName(scope)) };
  }
  return { scope, db: await current.db };
}

function request<T>(database: IDBDatabase, store: keyof Stores, mode: IDBTransactionMode, work: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const req = work(database.transaction(store, mode).objectStore(store));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(store: keyof Stores, mode: IDBTransactionMode, work: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const { db: database } = await db();
  return request(database, store, mode, work);
}

const listeners = new Set<() => void>();
const changed = () => listeners.forEach((l) => l());

// Switching accounts reloads every view of the store.
if (typeof window !== "undefined") subscribeScope(changed);

export const localStore = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => void listeners.delete(listener);
  },
  get: <K extends keyof Stores>(store: K, id: string) => run<Stores[K] | undefined>(store, "readonly", (s) => s.get(id)),
  async list<K extends keyof Stores>(store: K) {
    const rows = await run<Stores[K][]>(store, "readonly", (s) => s.getAll());
    return rows.sort((a, b) => b.createdAt - a.createdAt);
  },
  async put<K extends keyof Stores>(store: K, value: Stores[K]) {
    await run(store, "readwrite", (s) => s.put(value));
    changed();
  },
  /**
   * Writes only if `scope` is still the account in scope. A try-on that finishes after its owner signed out is
   * dropped instead of landing in the next person's database.
   */
  async putFor<K extends keyof Stores>(scope: string, store: K, value: Stores[K]): Promise<boolean> {
    const { scope: now, db: database } = await db();
    if (now !== scope) return false;
    await request(database, store, "readwrite", (s) => s.put(value));
    changed();
    return true;
  },
  /** Keeps only the newest `keep` rows of a store (by createdAt). */
  async prune(store: "decode", keep: number) {
    const rows = await localStore.list(store);
    for (const r of rows.slice(keep)) await run(store, "readwrite", (s) => s.delete(r.id));
    if (rows.length > keep) changed();
  },
  async remove(store: keyof Stores, id: string) {
    await run(store, "readwrite", (s) => s.delete(id));
    changed();
  },
  /** Empties every store of the account in scope (Delete all my data). */
  async clearAll() {
    const { db: database } = await db();
    for (const store of STORES) await request(database, store, "readwrite", (s) => s.clear());
    changed();
  },
};

export const newId = () => crypto.randomUUID();
export const currentScope = getAccountScope;

/* ---------- the shared pre-Phase E database ---------- */

export type LegacySummary = { photo: boolean; renders: number; briefs: number };

async function legacyExists(): Promise<boolean> {
  if (!("databases" in indexedDB)) return false;
  const list = await indexedDB.databases();
  return list.some((d) => d.name === LEGACY_DB);
}

export const legacy = {
  /** Counts only: what is in the shared database, without reading any image into the page. */
  async summary(): Promise<LegacySummary | null> {
    if (!(await legacyExists())) return null;
    const database = await openDb(LEGACY_DB, false);
    try {
      const count = (store: keyof Stores) => request<number>(database, store, "readonly", (s) => s.count());
      const summary = { photo: (await count("photo")) > 0, renders: await count("renders"), briefs: await count("briefs") };
      return summary.photo || summary.renders || summary.briefs ? summary : null;
    } finally {
      database.close();
    }
  },
  /** Moves everything into the account in scope, then deletes the shared database. Only on the person's say-so. */
  async adopt() {
    if (!(await legacyExists())) return;
    const from = await openDb(LEGACY_DB, false);
    const { db: to } = await db();
    try {
      for (const store of LEGACY_STORES) {
        const rows = await request<unknown[]>(from, store, "readonly", (s) => s.getAll());
        for (const row of rows) {
          // Keep the account's own photo if it already has one.
          if (store === "photo" && (await request(to, "photo", "readonly", (s) => s.get("active")))) continue;
          await request(to, store, "readwrite", (s) => s.put(row));
        }
      }
    } finally {
      from.close();
    }
    await legacy.discard();
    changed();
  },
  async discard() {
    await new Promise<void>((resolve, reject) => {
      const del = indexedDB.deleteDatabase(LEGACY_DB);
      del.onsuccess = () => resolve();
      del.onerror = () => reject(del.error);
      del.onblocked = () => resolve();
    });
  },
};
