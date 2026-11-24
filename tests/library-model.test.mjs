import assert from "node:assert/strict";
import { test } from "node:test";
import {
  LIBRARY_LIMITS,
  boardsWith,
  cleanBoardName,
  createBoard,
  deleteBoard,
  emptyLibrary,
  isLibraryError,
  mergeLibraries,
  renameBoard,
  sanitizeLibrary,
  setInBoard,
  clampLibrary,
  hasContent,
  resetLibrary,
  sameLibrary,
  setSaved,
  toggleSaved,
} from "../lib/library-model.ts";
import { DEVICE_SCOPE, getAccountScope, scopedKey, setAccountScope, whenScoped } from "../lib/account-scope.ts";

const KNOWN = new Set(["curly-top", "natural-afro", "sleek-low-bun", "tousled-bob"]);
const known = (id) => KNOWN.has(id);
const A = "aaaaaaaa-1111-4111-8111-111111111111";
const B = "bbbbbbbb-2222-4222-8222-222222222222";

test("create, rename and delete a board", () => {
  let lib = createBoard(emptyLibrary(), "  Next   cut ", A, 1);
  assert.equal(lib.boards[0].name, "Next cut");
  lib = renameBoard(lib, A, "Summer", 2);
  assert.equal(lib.boards[0].name, "Summer");
  assert.equal(lib.updatedAt, 2);
  lib = deleteBoard(lib, A, 3);
  assert.equal(lib.boards.length, 0);
});

test("board names are validated: required, unique ignoring case, capped", () => {
  const lib = createBoard(emptyLibrary(), "Summer", A, 1);
  assert.deepEqual(createBoard(lib, "   ", B, 2), { error: "name_required" });
  assert.deepEqual(createBoard(lib, "summer", B, 2), { error: "duplicate_name" });
  assert.deepEqual(renameBoard(lib, "missing-board-id", "X", 2), { error: "unknown_board" });
  assert.equal(cleanBoardName("x".repeat(100)).length, LIBRARY_LIMITS.name);
  assert.equal(cleanBoardName("a\u202eb\u0000c"), "a b c");
});

test("a look can sit in several boards and is stored once, by ID", () => {
  let lib = createBoard(emptyLibrary(), "One", A, 1);
  lib = createBoard(lib, "Two", B, 2);
  lib = setInBoard(lib, A, "curly-top", true, 3);
  lib = setInBoard(lib, B, "curly-top", true, 4);
  assert.deepEqual(boardsWith(lib, "curly-top").map((b) => b.id).sort(), [A, B].sort());
  // Adding to a board saves the look, once.
  assert.equal(lib.saved.filter((s) => s.lookId === "curly-top").length, 1);
  // Boards hold IDs only: no image paths or copies.
  assert.ok(lib.boards.every((b) => b.lookIds.every((id) => typeof id === "string" && !id.includes("/"))));
});

test("removing from a board, deleting a board or unsaving never touches the other", () => {
  let lib = createBoard(emptyLibrary(), "One", A, 1, "natural-afro");
  lib = setInBoard(lib, A, "natural-afro", false, 2);
  assert.ok(lib.saved.some((s) => s.lookId === "natural-afro"), "still saved after leaving the board");
  lib = setInBoard(lib, A, "natural-afro", true, 3);
  lib = deleteBoard(lib, A, 4);
  assert.ok(lib.saved.some((s) => s.lookId === "natural-afro"), "still saved after the board is deleted");
  let lib2 = createBoard(emptyLibrary(), "Two", B, 1, "tousled-bob");
  lib2 = setSaved(lib2, "tousled-bob", false, 2);
  assert.deepEqual(lib2.boards[0].lookIds, ["tousled-bob"], "unsaving keeps it in its boards");
});

test("toggleSaved is idempotent and newest first", () => {
  let lib = toggleSaved(emptyLibrary(), "curly-top", 1);
  lib = toggleSaved(lib, "natural-afro", 2);
  assert.deepEqual(lib.saved.map((s) => s.lookId), ["natural-afro", "curly-top"]);
  assert.equal(setSaved(lib, "curly-top", true, 3), lib, "no-op returns the same object");
  lib = toggleSaved(lib, "curly-top", 4);
  assert.deepEqual(lib.saved.map((s) => s.lookId), ["natural-afro"]);
});

test("limits are enforced", () => {
  let lib = emptyLibrary();
  for (let i = 0; i < LIBRARY_LIMITS.boards; i++) lib = createBoard(lib, `Board ${i}`, `board-${String(i).padStart(4, "0")}`, i);
  assert.deepEqual(createBoard(lib, "One more", "board-extra1", 999), { error: "too_many_boards" });
});

test("sanitizeLibrary drops unknown looks, bad IDs, duplicates and junk", () => {
  const dirty = {
    v: 1,
    updatedAt: 5,
    saved: [{ lookId: "curly-top", savedAt: 1 }, { lookId: "curly-top", savedAt: 2 }, { lookId: "../../etc/passwd" }, { lookId: "made-up-look" }, null],
    boards: [
      { id: A, name: "Ok\u0000", lookIds: ["curly-top", "curly-top", "https://evil.example/x.png", "natural-afro"], createdAt: 1, updatedAt: 1 },
      { id: A, name: "Duplicate id", lookIds: [] },
      { id: "Bad Id!", name: "x", lookIds: [] },
      { id: B, name: "   ", lookIds: [] },
      "nonsense",
    ],
  };
  const lib = sanitizeLibrary(dirty, known);
  assert.deepEqual(lib.saved.map((s) => s.lookId), ["curly-top"]);
  assert.equal(lib.boards.length, 1);
  assert.equal(lib.boards[0].name, "Ok");
  assert.deepEqual(lib.boards[0].lookIds, ["curly-top", "natural-afro"]);
  assert.equal(sanitizeLibrary({ v: 3, saved: [], boards: [] }, known), null);
  assert.equal(sanitizeLibrary("x", known), null);
});

test("merging two devices keeps both sides; the newer board edit wins", () => {
  let base = createBoard(emptyLibrary(), "Shared", A, 1);
  const phone = renameBoard(setSaved(base, "curly-top", true, 10), A, "Phone name", 10);
  const laptop = createBoard(setSaved(base, "tousled-bob", true, 20), "Laptop board", B, 20);
  const merged = mergeLibraries(phone, laptop, 30);
  assert.deepEqual(merged.saved.map((s) => s.lookId).sort(), ["curly-top", "tousled-bob"]);
  assert.deepEqual(merged.boards.map((b) => b.id).sort(), [A, B].sort());
  assert.equal(merged.boards.find((b) => b.id === A).name, "Phone name");
  assert.ok(!isLibraryError(merged));
});

/* ---------- conflict policy ---------- */

const ids = (lib) => lib.saved.map((s) => s.lookId).sort();
const sync = (x, y, now = 1000) => mergeLibraries(x, y, now);

test("a look removed on one device is not restored by a stale device that still has it", () => {
  const before = setSaved(emptyLibrary(), "curly-top", true, 1); // both devices had it
  const phone = setSaved(before, "curly-top", false, 10); // phone removes it
  const laptop = setSaved(before, "tousled-bob", true, 5); // laptop, stale, saves something else
  assert.deepEqual(ids(sync(phone, laptop)), ["tousled-bob"]);
  assert.deepEqual(ids(sync(laptop, phone)), ["tousled-bob"]);
  // Saving it again later does bring it back.
  const again = setSaved(sync(phone, laptop), "curly-top", true, 20);
  assert.deepEqual(ids(sync(again, laptop)), ["curly-top", "tousled-bob"]);
});

test("a deleted board stays deleted against a stale rename, and comes back only with later edits", () => {
  let before = createBoard(emptyLibrary(), "Wedding", A, 1, "curly-top");
  const phone = deleteBoard(before, A, 10);
  const staleLaptop = renameBoard(before, A, "Wedding guest", 5);
  assert.equal(sync(phone, staleLaptop).boards.length, 0, "rename from before the delete doesn't resurrect it");
  // An edit made after the deletion brings the board back, with only what was added after it.
  const lateLaptop = setInBoard(before, A, "natural-afro", true, 12);
  const merged = sync(phone, lateLaptop);
  assert.equal(merged.boards.length, 1);
  assert.deepEqual(merged.boards[0].lookIds, ["natural-afro"], "curly-top was in the board when it was deleted");
  // Its looks stay saved either way.
  assert.ok(merged.saved.some((s) => s.lookId === "curly-top"));
});

test("removing a look from a board on one device and adding another on a second keeps both edits", () => {
  const before = setInBoard(createBoard(emptyLibrary(), "Next cut", A, 1), A, "curly-top", true, 2);
  const phone = setInBoard(before, A, "curly-top", false, 10);
  const laptop = setInBoard(before, A, "tousled-bob", true, 11);
  for (const merged of [sync(phone, laptop), sync(laptop, phone)]) assert.deepEqual(merged.boards[0].lookIds, ["tousled-bob"]);
});

test("Delete all my data wins over a stale device; anything added after it survives", () => {
  const before = createBoard(setSaved(emptyLibrary(), "curly-top", true, 1), "Board", A, 2, "natural-afro");
  const reset = resetLibrary(10);
  assert.equal(reset.resetAt, 10);
  assert.ok(!hasContent(sync(reset, before)), "nothing from before the delete comes back");
  const laterOnStaleDevice = setSaved(before, "tousled-bob", true, 15);
  assert.deepEqual(ids(sync(reset, laterOnStaleDevice)), ["tousled-bob"]);
  assert.equal(sync(reset, laterOnStaleDevice).boards.length, 0);
});

test("merging is deterministic: order doesn't matter and repeating it changes nothing", () => {
  let x = createBoard(emptyLibrary(), "Alpha", A, 5, "curly-top");
  let y = renameBoard(createBoard(emptyLibrary(), "Alpha", A, 5, "curly-top"), A, "Beta", 5); // same name time: tie
  x = setSaved(deleteBoard(setInBoard(createBoard(x, "Gone", B, 6), B, "tousled-bob", true, 7), B, 8), "natural-afro", true, 9);
  y = setSaved(y, "natural-afro", false, 9);
  const xy = sync(x, y);
  const yx = sync(y, x);
  assert.ok(sameLibrary(xy, yx), "commutative");
  assert.ok(sameLibrary(sync(xy, xy), xy), "idempotent");
  assert.ok(sameLibrary(sync(sync(xy, x), y), xy), "associative here");
  assert.equal(xy.boards.find((b) => b.id === A).name, "Beta", "name ties break on the name, the same both ways");
});

test("libraries from before tombstones (v1) are upgraded", () => {
  const v1 = { v: 1, updatedAt: 5, saved: [{ lookId: "curly-top", savedAt: 3 }], boards: [{ id: A, name: "Old", lookIds: ["curly-top", "natural-afro"], createdAt: 1, updatedAt: 4 }] };
  const lib = sanitizeLibrary(v1, known);
  assert.equal(lib.v, 2);
  assert.deepEqual(lib.boards[0].lookIds.sort(), ["curly-top", "natural-afro"]);
  assert.equal(lib.boards[0].addedAt["curly-top"], 4);
  assert.deepEqual(lib.tombstones, { saved: {}, boards: {}, items: {} });
});

test("tombstones are validated and pruned after the retention window", () => {
  const now = Date.now();
  const lib = sanitizeLibrary({ v: 2, saved: [], boards: [], resetAt: 0, updatedAt: 0, tombstones: { saved: { "curly-top": now, "old-look": now - 400 * 86400000, "../x": now }, boards: { "bad id": now }, items: { [`${A}:curly-top`]: now, junk: now } } }, known);
  assert.deepEqual(Object.keys(lib.tombstones.saved), ["curly-top"]);
  assert.deepEqual(lib.tombstones.boards, {});
  assert.deepEqual(Object.keys(lib.tombstones.items), [`${A}:curly-top`]);
});

test("storage keys are per account, and nothing is scoped before sign-in resolves", async () => {
  assert.equal(getAccountScope(), null);
  assert.equal(scopedKey("hairpin:profile"), null, "no shared fallback key while signed out or loading");
  const waiting = whenScoped();
  setAccountScope("uid-alice");
  assert.equal(await waiting, "uid-alice");
  const alice = scopedKey("hairpin:profile");
  setAccountScope("uid-bob");
  const bob = scopedKey("hairpin:profile");
  assert.notEqual(alice, bob);
  assert.equal(alice, "hairpin:profile@uid-alice");
  setAccountScope(null);
  assert.equal(scopedKey("hairpin:library"), null);
  setAccountScope(DEVICE_SCOPE);
  assert.equal(scopedKey("hairpin:library"), "hairpin:library@device");
  setAccountScope(null);
});

test("a device with a fast clock can't override a newer change: the server clamps future timestamps", () => {
  const serverNow = 1_000;
  const before = setSaved(emptyLibrary(), "curly-top", true, 100);
  const legit = setSaved(before, "curly-top", false, 900); // removed at server time 900
  const skewed = clampLibrary(setSaved(before, "tousled-bob", true, 999_999), serverNow); // clock days ahead
  assert.equal(skewed.saved.find((s) => s.lookId === "tousled-bob").savedAt, serverNow);
  // A fast clock re-saving the removed look is clamped to the server's now, so its "future" claim doesn't win.
  const replay = clampLibrary(setSaved(setSaved(before, "curly-top", false, 50), "curly-top", true, 5_000_000), serverNow);
  assert.ok(replay.saved[0].savedAt <= serverNow);
  assert.deepEqual(ids(mergeLibraries(legit, skewed, serverNow)), ["tousled-bob"]);
});

test("deleting a board removes its memberships but never unsaves the looks", () => {
  let lib = createBoard(emptyLibrary(), "Wedding", A, 1, "curly-top");
  lib = setInBoard(lib, A, "natural-afro", true, 2);
  lib = createBoard(lib, "Other", B, 3, "curly-top");
  lib = deleteBoard(lib, A, 4);
  assert.deepEqual(ids(lib), ["curly-top", "natural-afro"], "both looks still saved");
  assert.deepEqual(boardsWith(lib, "natural-afro"), [], "no longer in any board");
  assert.deepEqual(boardsWith(lib, "curly-top").map((b) => b.id), [B], "still in the other board");
});
