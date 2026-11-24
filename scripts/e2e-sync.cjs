/**
 * Saved looks and Boards across two browsers signed in as the same person, including a stale browser.
 * Same server as e2e-accounts.cjs:
 *   NEXT_PUBLIC_HAIRPIN_TEST_AUTH=1 HAIRPIN_TEST_AUTH_SERVER=1 PUBLIK_MOCK=1 npx next dev -p 3212
 *   BASE_URL=http://localhost:3212 node scripts/e2e-sync.cjs
 */
const { chromium } = require("playwright");
const assert = require("node:assert");

const base = process.env.BASE_URL ?? "http://localhost:3212";
const UID = "test-sync";

(async () => {
  const browser = await chromium.launch(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {});
  const errors = [];
  async function device() {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`${base}/privacy`);
    await page.evaluate((u) => localStorage.setItem("hairpin.test-user", u), UID);
    return { ctx, page };
  }
  const saved = (page) => page.evaluate((u) => JSON.parse(localStorage.getItem(`hairpin:library@${u}`) ?? "null")?.lib?.saved?.map((s) => s.lookId).sort() ?? [], UID);
  const boards = (page) => page.evaluate((u) => JSON.parse(localStorage.getItem(`hairpin:library@${u}`) ?? "null")?.lib?.boards?.map((b) => b.name).sort() ?? [], UID);
  const server = (page) =>
    page.evaluate(async (u) => (await (await fetch("/api/library", { headers: { Authorization: `Bearer test:${u}` } })).json()).library, UID);
  const synced = (page) => page.getByRole("status").filter({ hasText: "saved to your account" }).first().waitFor();
  const toggle = async (page, name) => {
    await page.goto(`${base}/discover?look=${name}`);
    await page.getByRole("dialog").getByRole("button", { name: /^(Save |Remove .* from saved$)/ }).click();
  };

  const phone = await device();
  // Clean slate on the server.
  await phone.page.evaluate(async (u) => fetch("/api/library", { method: "DELETE", headers: { Authorization: `Bearer test:${u}` } }), UID);

  // 1. Phone saves two looks and makes a board; the laptop picks them up.
  await toggle(phone.page, "curly-top");
  await toggle(phone.page, "natural-afro");
  await phone.page.goto(`${base}/saved?tab=boards`);
  await phone.page.getByRole("button", { name: "Create a board" }).click();
  await phone.page.getByLabel("Board name").fill("Shared board");
  await phone.page.getByRole("button", { name: "Create board" }).click();
  await phone.page.goto(`${base}/saved`);
  await synced(phone.page);
  const laptop = await device();
  await laptop.page.goto(`${base}/saved`);
  await synced(laptop.page);
  assert.deepEqual(await saved(laptop.page), ["curly-top", "natural-afro"]);
  assert.deepEqual(await boards(laptop.page), ["Shared board"]);

  // 2. The laptop goes offline (stale). Meanwhile the phone removes a look and deletes the board.
  await laptop.page.route("**/api/library", (r) => r.abort());
  await toggle(phone.page, "curly-top");
  await phone.page.goto(`${base}/saved?tab=boards`);
  await phone.page.getByRole("button", { name: /^Shared board/ }).click();
  await phone.page.getByRole("button", { name: "Delete", exact: true }).click();
  await phone.page.getByRole("button", { name: "Delete board" }).click();
  await phone.page.goto(`${base}/saved`);
  await synced(phone.page);
  assert.deepEqual((await server(phone.page)).saved.map((s) => s.lookId), ["natural-afro"]);

  // 3. The stale laptop, still showing both looks and the board, saves something new while offline.
  await toggle(laptop.page, "tousled-bob");
  assert.deepEqual(await saved(laptop.page), ["curly-top", "natural-afro", "tousled-bob"]);

  // 4. Back online: its old copy must not bring back the removed look or the deleted board.
  await laptop.page.unroute("**/api/library");
  await laptop.page.goto(`${base}/saved`);
  await synced(laptop.page);
  const after = await server(laptop.page);
  assert.deepEqual(after.saved.map((s) => s.lookId).sort(), ["natural-afro", "tousled-bob"], "removal kept, new save kept");
  assert.deepEqual(after.boards, [], "deleted board stays deleted");
  assert.deepEqual(await saved(laptop.page), ["natural-afro", "tousled-bob"], "the stale browser catches up");
  assert.deepEqual(await boards(laptop.page), []);
  await phone.page.goto(`${base}/saved`);
  await synced(phone.page);
  assert.deepEqual(await saved(phone.page), ["natural-afro", "tousled-bob"], "and the phone gets the laptop's new save");

  // 5. Delete all my data on the phone while the laptop is offline again.
  await laptop.page.route("**/api/library", (r) => r.abort());
  await phone.page.goto(`${base}/you`);
  await phone.page.getByRole("button", { name: "Delete all my data" }).click();
  await phone.page.getByRole("button", { name: "Yes, delete it all" }).click();
  await phone.page.getByRole("status").filter({ hasText: "Deleted." }).waitFor();
  await laptop.page.unroute("**/api/library");
  await laptop.page.goto(`${base}/saved`);
  await synced(laptop.page);
  const wiped = await server(laptop.page);
  assert.equal(wiped.saved.length + wiped.boards.length, 0, "an offline browser can't push the deleted library back");
  assert.deepEqual(await saved(laptop.page), [], "and its own copy is cleared");

  assert.deepEqual(errors, [], "no uncaught page errors");
  console.log("sync: two browsers -> stale browser can't restore a removed look or deleted board -> new edits merge -> delete-all holds against an offline browser OK");
  await browser.close();
})().catch((e) => {
  console.error("E2E FAILED:", e.message);
  process.exit(1);
});
