/**
 * Saved, Boards and account isolation with two users on one device.
 * Needs a development server with test sign-in and mock AI (both are refused by production builds):
 *   NEXT_PUBLIC_HAIRPIN_TEST_AUTH=1 HAIRPIN_TEST_AUTH_SERVER=1 PUBLIK_MOCK=1 npx next dev -p 3212
 *   BASE_URL=http://localhost:3212 node scripts/e2e-accounts.cjs
 */
const { chromium } = require("playwright");
const path = require("node:path");
const assert = require("node:assert");

const base = process.env.BASE_URL ?? "http://localhost:3212";
const shots = process.env.SHOTS;
const photo = path.join(__dirname, "fixtures", "photo.jpg");

(async () => {
  const browser = await chromium.launch(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {});
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const shot = (name) => shots && page.screenshot({ path: path.join(shots, `${name}.png`), fullPage: true });
  const tab = (name) => page.getByRole("tab", { name: new RegExp(`^${name}`) });
  const count = async (name) => Number((await tab(name).innerText()).replace(/\D+/g, "") || 0);
  const api = (uid, method = "GET") =>
    page.evaluate(async ([uid, method]) => {
      const r = await fetch("/api/library", { method, headers: uid ? { Authorization: `Bearer test:${uid}` } : {} });
      return { status: r.status, body: r.status === 200 ? await r.json() : null };
    }, [uid, method]);
  async function signIn(uid) {
    await page.goto(`${base}/privacy`);
    await page.evaluate((u) => localStorage.setItem("hairpin.test-user", u), uid);
    await page.goto(`${base}/saved`);
    await page.getByRole("heading", { name: "Saved", level: 1 }).waitFor();
  }
  async function signOut() {
    await page.goto(`${base}/you`);
    await page.getByRole("button", { name: "Sign out" }).click();
    await page.waitForURL(`${base}/`);
  }

  // 0. Signed out: no private route renders, and the API refuses.
  await page.goto(`${base}/saved`);
  await page.waitForURL(`${base}/`);
  assert.equal((await api(null)).status, 401, "library needs a signed-in caller");
  // Start from empty server libraries (the dev server's memory outlives a run).
  for (const uid of ["test-alice", "test-bob"]) assert.equal((await api(uid, "DELETE")).status, 204);

  // 1. Data from before accounts were kept apart: one saved look and one try-on in the shared database.
  await page.evaluate(async () => {
    localStorage.setItem("hairpin:saved-looks", JSON.stringify(["tousled-bob"]));
    await new Promise((resolve, reject) => {
      const open = indexedDB.open("hairpin", 1);
      open.onupgradeneeded = () => ["photo", "renders", "briefs"].forEach((s) => open.result.createObjectStore(s, { keyPath: "id" }));
      open.onsuccess = () => {
        const tx = open.result.transaction("renders", "readwrite");
        tx.objectStore("renders").put({ id: "legacy-1", lookId: "tousled-bob", lookName: "Tousled bob", tweak: null, result: new Blob(["x"], { type: "image/png" }), mock: true, latencyMs: 1, createdAt: 1 });
        tx.oncomplete = () => (open.result.close(), resolve());
        tx.onerror = () => reject(tx.error);
      };
      open.onerror = () => reject(open.error);
    });
  });

  // 2. Alice signs in. Nothing moves until she says it's hers.
  await signIn("test-alice");
  await page.getByRole("heading", { name: "Found older items on this device" }).waitFor();
  await page.getByText("1 try-on and 1 saved look").waitFor();
  assert.equal(await count("Looks"), 0, "not adopted silently");
  await shot("legacy-prompt");
  await page.getByRole("button", { name: "They're mine, add them" }).click();
  await page.getByRole("heading", { name: "Found older items on this device" }).waitFor({ state: "detached" });
  await page.waitForFunction(() => document.querySelector("#tab-looks")?.textContent?.includes("1"));
  assert.equal(await count("Try-ons"), 1);

  // 3. Boards: create, add looks, rename, a look in two boards, delete one board.
  await tab("Boards").click();
  await page.getByRole("heading", { name: "Plan your next cut with boards" }).waitFor();
  await page.getByRole("button", { name: "Create a board" }).click();
  await page.getByLabel("Board name").fill("Next cut");
  await page.getByRole("button", { name: "Create board" }).click();
  await page.getByRole("heading", { name: "Next cut", level: 2 }).waitFor();
  await page.getByRole("button", { name: "Add looks" }).first().click();
  for (const name of ["Curly top", "Natural afro"]) await page.getByRole("dialog").getByRole("button", { name }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Done" }).click();
  await page.getByText("2 looks").first().waitFor();
  await page.getByRole("button", { name: "Rename" }).click();
  await page.getByLabel("Board name").fill("Wedding");
  await page.getByRole("button", { name: "Save name" }).click();
  await page.getByRole("heading", { name: "Wedding", level: 2 }).waitFor();
  await shot("board-detail");
  // Duplicate names are refused.
  await page.getByRole("button", { name: "← All boards" }).click();
  await page.getByRole("button", { name: "New board" }).click();
  await page.getByLabel("Board name").fill("wedding");
  await page.getByRole("button", { name: "Create board" }).click();
  await page.getByRole("alert").filter({ hasText: "already have a board" }).waitFor();
  await page.getByLabel("Board name").fill("Maybe");
  await page.getByRole("button", { name: "Create board" }).click();
  await page.getByRole("heading", { name: "Maybe", level: 2 }).waitFor();
  // Curly top into a second board from the Looks tab.
  await tab("Looks").click();
  await page.getByRole("button", { name: "Boards for Curly top" }).click();
  await page.getByRole("dialog").getByRole("checkbox", { name: "Maybe" }).check();
  await page.getByRole("dialog").getByRole("button", { name: "Close" }).click();
  await page.getByText("In 2 boards").waitFor();
  await tab("Boards").click();
  await shot("boards");
  await page.getByRole("button", { name: /^Maybe/ }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByRole("button", { name: "Delete board" }).click();
  await page.getByRole("button", { name: /^Wedding/ }).waitFor();
  assert.equal(await page.getByRole("button", { name: /^Maybe/ }).count(), 0);
  await tab("Looks").click();
  await page.getByRole("listitem").filter({ hasText: "Curly top" }).getByText("In 1 board").waitFor();
  assert.equal(await count("Looks"), 3, "Tousled bob, Curly top, Natural afro stay saved");
  // Opening a saved look goes to Discover with its sheet open, and Try hands over the look.
  await page.getByRole("link", { name: "Open Curly top in Discover" }).click();
  await page.waitForURL(/\/discover\?look=curly-top/);
  await page.getByRole("heading", { name: "Curly top", level: 2 }).waitFor();
  await page.keyboard.press("Escape");

  // 4. Alice's private data: a photo, a try-on and her own key.
  await page.goto(`${base}/try?look=natural-afro`);
  await page.waitForLoadState("networkidle"); // a cold dev server hydrates late; a file picked earlier is lost
  await page.locator("input[type=file]").first().setInputFiles(photo);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Use this photo" }).click();
  await page.getByRole("button", { name: "Use the written description" }).first().click();
  await page.getByRole("button", { name: "Generate try-on" }).click();
  await page.getByText("Made from a written description of Natural afro.", { exact: false }).waitFor();
  await page.evaluate(() => localStorage.setItem("hairpin.ai-choice@test-alice", JSON.stringify({ mode: "own", key: "sk-alice-not-real" })));
  // The server copy of her library has her board.
  const aliceServer = await api("test-alice");
  assert.deepEqual(aliceServer.body.library.boards.map((b) => b.name), ["Wedding"]);

  // 5. Sign out: her own key is forgotten on this device; her data stays in her own scope.
  await signOut();
  assert.equal(await page.evaluate(() => localStorage.getItem("hairpin.ai-choice@test-alice")), null, "own key removed on sign-out");

  // 6. Bob signs in on the same device and sees none of Alice's things.
  await signIn("test-bob");
  assert.equal(await page.getByRole("heading", { name: "Found older items on this device" }).count(), 0, "legacy data already handled");
  for (const name of ["Looks", "Boards", "Try-ons", "Briefs"]) assert.equal(await count(name), 0, `Bob sees no ${name}`);
  await shot("bob-empty");
  await page.goto(`${base}/try`);
  await page.getByRole("button", { name: "Choose a photo" }).waitFor();
  await page.goto(`${base}/you`);
  await page.getByText("No photo saved yet.").waitFor();
  const bobLib = (await api("test-bob")).body.library;
  assert.ok(bobLib === null || (bobLib.saved.length === 0 && bobLib.boards.length === 0), "Bob's server library is empty");
  const storage = await page.evaluate(async () => ({
    dbs: (await indexedDB.databases()).map((d) => d.name).sort(),
    keys: Object.keys(localStorage).sort(),
  }));
  assert.ok(storage.dbs.includes("hairpin@test-alice") && !storage.dbs.includes("hairpin"), "shared database gone, Alice's kept apart");
  // Bob makes his own board.
  await page.goto(`${base}/saved?tab=boards`);
  await page.getByRole("button", { name: "Create a board" }).click();
  await page.getByLabel("Board name").fill("Bob board");
  await page.getByRole("button", { name: "Create board" }).click();
  await page.getByRole("heading", { name: "Bob board", level: 2 }).waitFor();
  await page.waitForFunction(async () => (await (await fetch("/api/library", { headers: { Authorization: "Bearer test:test-bob" } })).json()).library?.boards?.length === 1);
  await signOut();

  // 7. Alice again, with this device's copy of her library wiped: it comes back from her account. Bob's board does not.
  await page.evaluate(() => localStorage.removeItem("hairpin:library@test-alice"));
  await signIn("test-alice");
  await page.waitForFunction(() => document.querySelector("#tab-boards")?.textContent?.includes("1"));
  await tab("Boards").click();
  await page.getByRole("button", { name: /^Wedding/ }).waitFor();
  assert.equal(await page.getByRole("button", { name: /^Bob board/ }).count(), 0);
  assert.equal(await count("Try-ons"), 2, "her legacy and new try-on are still here");

  // 8. Alice deletes everything: her device data and her server library go; Bob's stay.
  await page.goto(`${base}/you`);
  await page.getByRole("button", { name: "Delete all my data" }).click();
  await page.getByRole("button", { name: "Yes, delete it all" }).click();
  await page.getByRole("status").filter({ hasText: "Deleted." }).waitFor();
  await page.getByText("No photo saved yet.").waitFor();
  const afterDelete = (await api("test-alice")).body.library;
  assert.ok(afterDelete === null || (afterDelete.saved.length === 0 && afterDelete.boards.length === 0 && afterDelete.resetAt > 0), "Alice's server library deleted, leaving only a reset marker");
  assert.equal((await api("test-bob")).body.library.boards[0].name, "Bob board", "Bob's untouched");
  await page.goto(`${base}/saved`);
  for (const name of ["Looks", "Boards", "Try-ons", "Briefs"]) assert.equal(await count(name), 0, `Alice has no ${name} after delete`);
  await signOut();
  await signIn("test-bob");
  assert.equal(await count("Boards"), 1, "Bob's board survives Alice's delete");

  // 9. Bob deletes his account: server records, this device's copy, then the sign-in itself.
  await page.goto(`${base}/you`);
  await page.getByRole("button", { name: "Delete my account" }).click();
  await page.getByRole("group", { name: "Confirm account deletion" }).getByRole("button", { name: "Delete my account" }).click();
  await page.waitForURL(`${base}/`);
  const gone = (await api("test-bob")).body.library;
  assert.ok(gone === null || (gone.saved.length === 0 && gone.boards.length === 0), "Bob's server library is gone");
  const bobKeys = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.endsWith("@test-bob")));
  assert.deepEqual(bobKeys, [], "no account keys left on the device");
  assert.equal(await page.evaluate(() => localStorage.getItem("hairpin.test-user")), null, "signed out");

  assert.deepEqual(errors, [], "no uncaught page errors");
  console.log("accounts: legacy prompt -> adopt -> boards CRUD -> multi-board -> sign-out clears key -> Bob isolated -> server restore -> delete is per account -> account deletion OK");
  await browser.close();
})().catch((e) => {
  console.error("E2E FAILED:", e.message);
  process.exit(1);
});
