import type { BarberBrief } from "./brief";

/**
 * On-device storage for the user's photo, renders and briefs (IndexedDB).
 * Nothing here leaves the device. When Firebase is connected this is the seam
 * to swap for private Cloud Storage paths and Firestore documents.
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
  latencyMs: number;
  createdAt: number;
};
export type StoredBrief = { id: string; renderId: string; brief: BarberBrief; mock: boolean; includePhoto: boolean; createdAt: number };

type Stores = { photo: StoredPhoto; renders: StoredRender; briefs: StoredBrief };

let dbPromise: Promise<IDBDatabase> | null = null;

function db() {
  dbPromise ??= new Promise((resolve, reject) => {
    const open = indexedDB.open("hairpin", 1);
    open.onupgradeneeded = () => {
      for (const name of ["photo", "renders", "briefs"]) open.result.createObjectStore(name, { keyPath: "id" });
    };
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
  });
  return dbPromise;
}

async function run<T>(store: keyof Stores, mode: IDBTransactionMode, work: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const database = await db();
  return new Promise((resolve, reject) => {
    const request = work(database.transaction(store, mode).objectStore(store));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

const listeners = new Set<() => void>();
const changed = () => listeners.forEach((l) => l());

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
  async remove(store: keyof Stores, id: string) {
    await run(store, "readwrite", (s) => s.delete(id));
    changed();
  },
};

export const newId = () => crypto.randomUUID();
