/**
 * End-to-end check of community cuts: share -> pending (invisible to others) -> admin approve -> visible -> three reports
 * hold it -> re-approve -> owner deletes it everywhere, plus per-account isolation of private cuts.
 *   NEXT_PUBLIC_HAIRPIN_TEST_AUTH=1 HAIRPIN_TEST_AUTH_SERVER=1 HAIRPIN_ADMIN_UIDS=test-admin1 PUBLIK_MOCK=1 npx next dev -p 3212
 *   BASE_URL=http://localhost:3212 node scripts/e2e-community.cjs
 * Uses the in-memory fallbacks for Blob and Redis, so it needs neither a Blob token nor Upstash.
 */
const { chromium } = require("playwright");
const assert = require("node:assert");
const path = require("node:path");
const shots = process.env.SHOTS;
const base = process.env.BASE_URL ?? "http://localhost:3212";
const photo = path.join(process.cwd(), "scripts/fixtures/photo.jpg");
const NAME = "Community crop " + Date.now().toString(36);

(async () => {
  const b = await chromium.launch();
  const errs = [];
  async function as(uid) {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } });
    const p = await ctx.newPage();
    p.on("pageerror", (e) => errs.push(`${uid}: ${e.message}`));
    await p.goto(base + "/");
    await p.evaluate((u) => localStorage.setItem("hairpin.test-user", u), uid);
    return p;
  }
  const discover = async (p) => {
    await p.goto(base + "/discover");
    await p.getByRole("button", { name: /^Curly top, .*Open details$/ }).waitFor({ timeout: 90000 });
    await p.waitForLoadState("networkidle");
  };
  const sees = async (p, name) => {
    await p.getByRole("searchbox", { name: "Search looks" }).fill(name.split(" ").slice(-1)[0]);
    await p.waitForTimeout(500);
    return (await p.getByRole("button", { name: new RegExp("^" + name) }).count()) > 0;
  };

  // 1. Alice shares a cut.
  const alice = await as("test-alice1");
  await discover(alice);
  await alice.getByRole("button", { name: "Add a cut" }).click();
  const dlg = alice.getByRole("dialog");
  await dlg.locator("input[type=file]").first().setInputFiles(photo);
  await dlg.getByText(/Made small for you/).waitFor({ timeout: 20000 });
  await dlg.getByLabel("Name").fill(NAME);
  await dlg.getByLabel("What to ask your barber for").fill("Shared for the test.");
  await dlg.getByRole("group", { name: "Who is it for" }).getByRole("button", { name: "Any", exact: true }).click();
  await dlg.getByRole("group", { name: "Length" }).getByRole("button", { name: "short" }).click();
  await dlg.getByRole("radio", { name: /^Wavy/ }).click();
  await dlg.getByRole("radio", { name: /^2B/ }).click();
  await dlg.getByRole("button", { name: "Share publicly (reviewed first)" }).click();
  assert.ok(await dlg.getByRole("button", { name: "Add and share for review" }).isDisabled(), "needs both consents");
  await dlg.getByLabel(/This is my own photo/).check();
  assert.ok(await dlg.getByRole("button", { name: "Add and share for review" }).isDisabled(), "still needs the display consent");
  await dlg.getByLabel(/happy for Hairpin to show/).check();
  shots && (await alice.screenshot({ path: path.join(shots, "share.png") }));
  await dlg.getByRole("button", { name: "Add and share for review" }).click();
  await dlg.waitFor({ state: "hidden", timeout: 20000 });
  await alice.getByRole("button", { name: new RegExp("^" + NAME) }).click();
  await alice.getByRole("dialog").getByText("Waiting for review before it's shown to others.").waitFor();
  console.log("1 alice shared: pending");

  // 2. Bob cannot see it while pending.
  const bob = await as("test-bob1");
  await discover(bob);
  assert.ok(!(await sees(bob, NAME)), "pending posts are not public");
  console.log("2 bob can't see the pending cut");
  // Private data is per account: Alice's cut is not in Bob's "Mine", and Bob's taste is stored under his own key.
  await bob.getByRole("group", { name: "Feed" }).getByRole("button", { name: /^Mine/ }).click();
  await bob.getByRole("heading", { name: "Add your first cut" }).waitFor();
  const keys = await bob.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("hairpin:taste") || k.startsWith("hairpin:feed-key")));
  assert.ok(keys.every((k) => k.endsWith("@test-bob1")), "taste and feed state are scoped to the account: " + keys);
  await bob.getByRole("group", { name: "Feed" }).getByRole("button", { name: /^For you/ }).click();
  console.log("2b bob's private data is separate from alice's");

  // 3. A non-admin is refused by the review queue.
  const forbidden = await bob.evaluate(async () => {
    const r = await fetch("/api/admin/posts", { headers: { Authorization: "Bearer test:" + localStorage.getItem("hairpin.test-user") } });
    return r.status;
  });
  assert.equal(forbidden, 403);
  console.log("3 non-admin gets 403");

  // 4. The admin approves it.
  const admin = await as("test-admin1");
  await admin.goto(base + "/admin/posts");
  await admin.getByRole("heading", { name: /cuts/ }).waitFor({ timeout: 60000 });
  await admin.getByText(NAME).waitFor();
  shots && (await admin.screenshot({ path: path.join(shots, "admin.png") }));
  await admin.getByRole("listitem").filter({ hasText: NAME }).getByRole("button", { name: "Approve" }).click();
  await admin.getByText(NAME).waitFor({ state: "detached" });
  console.log("4 admin approved");

  // 5. Bob now sees it, can open it and report it; the image is served.
  await discover(bob);
  assert.ok(await sees(bob, NAME), "approved posts are public");
  const img = await bob.getByRole("button", { name: new RegExp("^" + NAME) }).locator("img[data-look]").first().evaluate((i) => i.currentSrc || i.src);
  const status = await bob.evaluate(async (u) => (await fetch(u)).status, img);
  assert.equal(status, 200, "image served: " + img);
  await bob.getByRole("button", { name: new RegExp("^" + NAME) }).click();
  shots && (await bob.screenshot({ path: path.join(shots, "community-sheet.png") }));
  const sheet = bob.getByRole("dialog");
  await sheet.getByRole("button", { name: "Report", exact: true }).click();
  await sheet.getByRole("button", { name: "Report", exact: true }).click();
  await sheet.getByText("Thanks. We'll take a look.").waitFor();
  console.log("5 bob sees, opens and reports it");

  // 6. Two more different people report: held, gone for everyone.
  for (const uid of ["test-carol1", "test-dave1"]) {
    const p = await as(uid);
    await discover(p);
    assert.ok(await sees(p, NAME));
    await p.getByRole("button", { name: new RegExp("^" + NAME) }).click();
    await p.getByRole("dialog").getByRole("button", { name: "Report", exact: true }).click();
    await p.getByRole("dialog").getByRole("button", { name: "Report", exact: true }).click();
    await p.getByRole("dialog").getByText("Thanks. We'll take a look.").waitFor();
  }
  const erin = await as("test-erin1");
  await discover(erin);
  assert.ok(!(await sees(erin, NAME)), "three reporters take it down");
  await admin.goto(base + "/admin/posts");
  await admin.getByText(NAME).waitFor();
  await admin.getByText("Held").first().waitFor();
  console.log("6 three reports held it; it is back in the queue as Held");

  // 7. Admin re-approves; the owner deletes it, including the public copy.
  await admin.getByRole("listitem").filter({ hasText: NAME }).getByRole("button", { name: "Approve" }).click();
  await admin.getByText(NAME).waitFor({ state: "detached" });
  await discover(alice);
  await alice.getByRole("group", { name: "Feed" }).getByRole("button", { name: /^Mine/ }).click();
  await alice.getByRole("button", { name: new RegExp("^" + NAME) }).click();
  await alice.getByRole("dialog").getByText("Shared publicly. Other members can see it.").waitFor();
  assert.equal(await alice.getByRole("button", { name: new RegExp("^" + NAME) }).count(), 1, "the owner sees their own cut once, not twice");
  await alice.getByRole("dialog").getByRole("button", { name: "Delete", exact: true }).click();
  await alice.getByRole("dialog").getByRole("button", { name: "Delete, including the public copy" }).click();
  await alice.getByRole("heading", { name: "Add your first cut" }).waitFor({ timeout: 20000 });
  await discover(bob);
  assert.ok(!(await sees(bob, NAME)), "deleted from the public library");
  assert.equal(await bob.evaluate(async (u) => (await fetch(u, { cache: "no-store" })).status, img), 404, "image removed");
  console.log("7 owner deleted it everywhere; image gone");

  console.log(errs.length ? errs : "no page errors");
  await b.close();
})().catch((e) => { console.error("FAILED:", e.message.split("\n").slice(0, 8).join("\n")); process.exit(1); });
