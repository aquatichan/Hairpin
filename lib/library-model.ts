/**
 * Saved looks and Boards: the data model, every change to it, and how two copies are merged. Pure functions shared by
 * the client, the /api/library route and `node --test`.
 *
 * A board holds catalog look IDs only, never images or copies, so a look can sit in any number of boards without
 * being stored twice. Nothing private (selfies, try-ons, briefs) is ever part of this document.
 *
 * Conflict policy (deterministic, the same whichever copy merges first):
 *  - Every add, rename and removal carries a timestamp. Removals leave a tombstone: the time it was removed.
 *  - An element survives a merge only if its latest add is newer than its latest removal. So a stale device can never
 *    bring back something removed after it last changed it; adding it again later does bring it back.
 *  - Deleting a board removes everything in it as of that moment. An edit made to the board after the deletion
 *    brings the board back, with only what was added after the deletion.
 *  - "Delete all my data" sets `resetAt`: everything at or before that moment is gone on every device.
 *  - Ties in board names are broken by the name itself, so both orders give the same result.
 * Ordering uses the server's clock, not each device's: every sync returns the server time and devices stamp edits with
 * their clock corrected by that offset (lib/library.ts), and the server clamps any timestamp later than its own "now"
 * (clampLibrary), so a device with a wrong clock can't override a newer change. Offline edits use the last known
 * offset. Tombstones older than TOMBSTONE_DAYS are pruned, so a device offline for longer than that can still restore
 * something.
 */

export type SavedLook = { lookId: string; savedAt: number };
export type Board = {
  id: string;
  name: string;
  /** When the name was last set. */
  nameAt: number;
  createdAt: number;
  updatedAt: number;
  /** Newest first. Derived from `addedAt`. */
  lookIds: string[];
  /** When each look was (last) added to this board. */
  addedAt: Record<string, number>;
};
export type Tombstones = {
  saved: Record<string, number>;
  boards: Record<string, number>;
  /** Keyed `${boardId}:${lookId}`. */
  items: Record<string, number>;
};
export type Library = { v: 2; saved: SavedLook[]; boards: Board[]; tombstones: Tombstones; resetAt: number; updatedAt: number };

export const LIBRARY_LIMITS = Object.freeze({ boards: 50, perBoard: 200, saved: 500, name: 40, bytes: 256_000, tombstones: 2000 });
export const TOMBSTONE_DAYS = 180;

export const emptyTombstones = (): Tombstones => ({ saved: {}, boards: {}, items: {} });
export const emptyLibrary = (): Library => ({ v: 2, saved: [], boards: [], tombstones: emptyTombstones(), resetAt: 0, updatedAt: 0 });

const LOOK_ID = /^[a-z0-9]+(?:-[a-z0-9]+){0,7}$/;
const BOARD_ID = /^[a-z0-9][a-z0-9-]{7,39}$/;
export const isBoardId = (v: unknown): v is string => typeof v === "string" && BOARD_ID.test(v);
const itemKey = (boardId: string, lookId: string) => `${boardId}:${lookId}`;

/** Board names: no control or bidi characters, collapsed whitespace, 1 to 40 characters. */
export function cleanBoardName(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u206f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, LIBRARY_LIMITS.name);
}

export type LibraryError = { error: "name_required" | "too_many_boards" | "board_full" | "duplicate_name" | "unknown_board" };
const err = (error: LibraryError["error"]): LibraryError => ({ error });
export const isLibraryError = (v: unknown): v is LibraryError => typeof v === "object" && v !== null && "error" in v;

const withTomb = (lib: Library, kind: keyof Tombstones, key: string, at: number): Tombstones => ({ ...lib.tombstones, [kind]: { ...lib.tombstones[kind], [key]: at } });
const orderIds = (addedAt: Record<string, number>) => Object.keys(addedAt).sort((a, b) => addedAt[b] - addedAt[a] || a.localeCompare(b));

export const isSaved = (lib: Library, lookId: string) => lib.saved.some((s) => s.lookId === lookId);

export function setSaved(lib: Library, lookId: string, on: boolean, now: number): Library {
  const has = isSaved(lib, lookId);
  if (on === has) return lib;
  if (!on) return { ...lib, saved: lib.saved.filter((s) => s.lookId !== lookId), tombstones: withTomb(lib, "saved", lookId, now), updatedAt: now };
  if (lib.saved.length >= LIBRARY_LIMITS.saved) return lib;
  return { ...lib, saved: [{ lookId, savedAt: now }, ...lib.saved], updatedAt: now };
}

export const toggleSaved = (lib: Library, lookId: string, now: number) => setSaved(lib, lookId, !isSaved(lib, lookId), now);

const sameName = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: "base" }) === 0;

export function createBoard(lib: Library, rawName: string, id: string, now: number, firstLookId?: string): Library | LibraryError {
  const name = cleanBoardName(rawName);
  if (!name) return err("name_required");
  if (lib.boards.length >= LIBRARY_LIMITS.boards) return err("too_many_boards");
  if (lib.boards.some((b) => sameName(b.name, name))) return err("duplicate_name");
  const addedAt = firstLookId ? { [firstLookId]: now } : {};
  const board: Board = { id, name, nameAt: now, createdAt: now, updatedAt: now, lookIds: orderIds(addedAt), addedAt };
  const next = { ...lib, boards: [board, ...lib.boards], updatedAt: now };
  return firstLookId ? setSaved(next, firstLookId, true, now) : next;
}

export function renameBoard(lib: Library, id: string, rawName: string, now: number): Library | LibraryError {
  const name = cleanBoardName(rawName);
  if (!name) return err("name_required");
  if (!lib.boards.some((b) => b.id === id)) return err("unknown_board");
  if (lib.boards.some((b) => b.id !== id && sameName(b.name, name))) return err("duplicate_name");
  return { ...lib, boards: lib.boards.map((b) => (b.id === id ? { ...b, name, nameAt: now, updatedAt: now } : b)), updatedAt: now };
}

/** Deleting a board never unsaves its looks: they stay in Saved and in any other board. */
export function deleteBoard(lib: Library, id: string, now: number): Library {
  if (!lib.boards.some((b) => b.id === id)) return lib;
  return { ...lib, boards: lib.boards.filter((b) => b.id !== id), tombstones: withTomb(lib, "boards", id, now), updatedAt: now };
}

/** Adding a look to a board also saves it. Removing it from a board leaves it saved. */
export function setInBoard(lib: Library, boardId: string, lookId: string, on: boolean, now: number): Library | LibraryError {
  const board = lib.boards.find((b) => b.id === boardId);
  if (!board) return err("unknown_board");
  const has = board.lookIds.includes(lookId);
  if (on === has) return lib;
  if (on && board.lookIds.length >= LIBRARY_LIMITS.perBoard) return err("board_full");
  const addedAt = { ...board.addedAt };
  if (on) addedAt[lookId] = now;
  else delete addedAt[lookId];
  const nextBoard = { ...board, addedAt, lookIds: orderIds(addedAt), updatedAt: now };
  const next: Library = {
    ...lib,
    boards: lib.boards.map((b) => (b.id === boardId ? nextBoard : b)),
    tombstones: on ? lib.tombstones : withTomb(lib, "items", itemKey(boardId, lookId), now),
    updatedAt: now,
  };
  return on ? setSaved(next, lookId, true, now) : next;
}

export const boardsWith = (lib: Library, lookId: string) => lib.boards.filter((b) => b.lookIds.includes(lookId));
export const hasContent = (lib: Library) => lib.saved.length > 0 || lib.boards.length > 0;

/** "Delete all my data": nothing from before `now` survives a merge on any device. */
export const resetLibrary = (now: number): Library => ({ ...emptyLibrary(), resetAt: now, updatedAt: now });

/* ---------- validation ---------- */

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);

function cleanTimes(raw: unknown, keyOk: (k: string) => boolean): Record<string, number> {
  const out: Record<string, number> = {};
  if (typeof raw !== "object" || raw === null) return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) if (keyOk(k) && num(v) > 0) out[k] = num(v);
  return out;
}

/**
 * Validates anything claiming to be a library (v2, or v1 from before tombstones): right shape, known looks only,
 * deduplicated, capped and with clean names. Returns null if it isn't a library at all.
 */
export function sanitizeLibrary(input: unknown, isKnownLook: (id: string) => boolean): Library | null {
  if (typeof input !== "object" || input === null) return null;
  const raw = input as Record<string, unknown>;
  if ((raw.v !== 1 && raw.v !== 2) || !Array.isArray(raw.saved) || !Array.isArray(raw.boards)) return null;
  const look = (v: unknown): v is string => typeof v === "string" && LOOK_ID.test(v) && isKnownLook(v);

  const seen = new Set<string>();
  const saved: SavedLook[] = [];
  for (const s of raw.saved) {
    const id = (s as SavedLook | null)?.lookId;
    if (look(id) && !seen.has(id) && saved.length < LIBRARY_LIMITS.saved) {
      seen.add(id);
      saved.push({ lookId: id, savedAt: num((s as SavedLook).savedAt) });
    }
  }

  const boards: Board[] = [];
  const ids = new Set<string>();
  for (const b of raw.boards) {
    if (boards.length >= LIBRARY_LIMITS.boards || typeof b !== "object" || b === null) continue;
    const board = b as Partial<Board> & { lookIds?: unknown };
    const name = cleanBoardName(board.name);
    if (!isBoardId(board.id) || ids.has(board.id) || !name) continue;
    ids.add(board.id);
    const updatedAt = num(board.updatedAt);
    // v1 boards had only lookIds; their add time is the board's last update.
    const addedAt =
      raw.v === 1
        ? Object.fromEntries((Array.isArray(board.lookIds) ? board.lookIds.filter(look) : []).map((id) => [id, updatedAt || 1]))
        : cleanTimes(board.addedAt, look);
    const capped = Object.fromEntries(orderIds(addedAt).slice(0, LIBRARY_LIMITS.perBoard).map((id) => [id, addedAt[id]]));
    boards.push({ id: board.id, name, nameAt: num(board.nameAt) || updatedAt, createdAt: num(board.createdAt), updatedAt, lookIds: orderIds(capped), addedAt: capped });
  }

  const t = (raw.tombstones ?? {}) as Record<string, unknown>;
  const tombstones: Tombstones = {
    saved: cleanTimes(t.saved, (k) => LOOK_ID.test(k)),
    boards: cleanTimes(t.boards, isBoardId),
    items: cleanTimes(t.items, (k) => {
      const [b, l] = k.split(":");
      return isBoardId(b) && LOOK_ID.test(l ?? "");
    }),
  };
  return { v: 2, saved, boards, tombstones: pruneTombstones(tombstones, Date.now()), resetAt: num(raw.resetAt), updatedAt: num(raw.updatedAt) };
}

function pruneTombstones(t: Tombstones, now: number): Tombstones {
  const cutoff = now - TOMBSTONE_DAYS * 86_400_000;
  const prune = (m: Record<string, number>) =>
    Object.fromEntries(
      Object.entries(m)
        .filter(([, at]) => at >= cutoff)
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, LIBRARY_LIMITS.tombstones),
    );
  return { saved: prune(t.saved), boards: prune(t.boards), items: prune(t.items) };
}

/* ---------- merge ---------- */

const maxTimes = (a: Record<string, number>, b: Record<string, number>) => {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = Math.max(out[k] ?? 0, v);
  return out;
};

/** Combines two copies under the conflict policy above. Commutative: merge(a, b) equals merge(b, a). */
export function mergeLibraries(a: Library, b: Library, now: number): Library {
  const resetAt = Math.max(a.resetAt, b.resetAt);
  const tomb: Tombstones = { saved: maxTimes(a.tombstones.saved, b.tombstones.saved), boards: maxTimes(a.tombstones.boards, b.tombstones.boards), items: maxTimes(a.tombstones.items, b.tombstones.items) };

  const savedAt: Record<string, number> = {};
  for (const s of [...a.saved, ...b.saved]) savedAt[s.lookId] = Math.max(savedAt[s.lookId] ?? 0, s.savedAt);
  const saved = Object.entries(savedAt)
    .filter(([id, at]) => at > Math.max(tomb.saved[id] ?? 0, resetAt))
    .sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]))
    .slice(0, LIBRARY_LIMITS.saved)
    .map(([lookId, at]) => ({ lookId, savedAt: at }));

  const byId = new Map<string, Board[]>();
  for (const board of [...a.boards, ...b.boards]) byId.set(board.id, [...(byId.get(board.id) ?? []), board]);
  const boards: Board[] = [];
  for (const [id, copies] of byId) {
    const deletedAt = Math.max(tomb.boards[id] ?? 0, resetAt);
    // The newer name wins; equal times fall back to the name itself so both merge orders agree.
    const named = copies.reduce((x, y) => (y.nameAt > x.nameAt || (y.nameAt === x.nameAt && y.name.localeCompare(x.name) > 0) ? y : x));
    let addedAt: Record<string, number> = {};
    for (const c of copies) addedAt = maxTimes(addedAt, c.addedAt);
    addedAt = Object.fromEntries(Object.entries(addedAt).filter(([look, at]) => at > Math.max(tomb.items[`${id}:${look}`] ?? 0, deletedAt)));
    const lastEdit = Math.max(named.nameAt, ...Object.values(addedAt), ...copies.map((c) => (c.createdAt > deletedAt ? c.createdAt : 0)));
    if (lastEdit <= deletedAt) continue; // deleted, and nothing happened to it afterwards
    const capped = Object.fromEntries(orderIds(addedAt).slice(0, LIBRARY_LIMITS.perBoard).map((k) => [k, addedAt[k]]));
    boards.push({
      id,
      name: named.name,
      nameAt: named.nameAt,
      createdAt: Math.min(...copies.map((c) => c.createdAt)),
      updatedAt: Math.max(...copies.map((c) => c.updatedAt)),
      lookIds: orderIds(capped),
      addedAt: capped,
    });
  }
  boards.sort((x, y) => y.createdAt - x.createdAt || x.id.localeCompare(y.id));

  return {
    v: 2,
    saved,
    boards: boards.slice(0, LIBRARY_LIMITS.boards),
    tombstones: pruneTombstones(tomb, now),
    resetAt,
    updatedAt: Math.max(a.updatedAt, b.updatedAt),
  };
}

/** Server side: no timestamp may be later than the server's now, so a device with a fast clock can't win by it. */
export function clampLibrary(lib: Library, now: number): Library {
  const c = (t: number) => Math.min(t, now);
  const times = (m: Record<string, number>) => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, c(v)]));
  return {
    ...lib,
    saved: lib.saved.map((s) => ({ ...s, savedAt: c(s.savedAt) })),
    boards: lib.boards.map((b) => ({ ...b, nameAt: c(b.nameAt), createdAt: c(b.createdAt), updatedAt: c(b.updatedAt), addedAt: times(b.addedAt) })),
    tombstones: { saved: times(lib.tombstones.saved), boards: times(lib.tombstones.boards), items: times(lib.tombstones.items) },
    resetAt: c(lib.resetAt),
    updatedAt: c(lib.updatedAt),
  };
}

/** Same content (ignoring `updatedAt`), so a sync round trip that changes nothing doesn't trigger another. */
export function sameLibrary(a: Library, b: Library): boolean {
  const strip = (l: Library) => JSON.stringify({ ...l, updatedAt: 0 });
  return strip(a) === strip(b);
}
