/**
 * End-to-end check of the core loop against a running dev server.
 *   PUBLIK_MOCK=1 npm run dev     then     node scripts/e2e.cjs mock
 *   npm run dev                   then     node scripts/e2e.cjs unconnected
 */
const { chromium } = require("playwright");
const path = require("node:path");
const assert = require("node:assert");

const mode = process.argv[2] ?? "mock";
const base = process.env.BASE_URL ?? "http://localhost:3000";
const shots = process.env.SHOTS;
const photo = path.join(__dirname, "fixtures", "photo.jpg");

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const shot = (name) => shots && page.screenshot({ path: path.join(shots, `${name}.png`) });

  // The gallery is home. With no photos yet it shows an honest "being stocked" state.
  await page.goto(`${base}/discover`);
  await page.getByRole("heading", { name: "The library is being stocked" }).waitFor();
  await shot("gallery-empty");

  // Trying a screenshot: onboarding runs on the way to Try the first time.
  await page.goto(`${base}/welcome?next=${encodeURIComponent("/try")}`);
  for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "wavy" }).click();
  await shot("welcome");
  await page.getByRole("button", { name: "Let's try it" }).click();
  await page.waitForURL(/\/try$/);

  // Photo setup needs both a photo and consent
  const save = page.getByRole("button", { name: "Save my photo" });
  await assert.rejects(save.click({ timeout: 500, trial: true }), "save must be disabled without a photo");
  await page.locator('input[type=file]').first().setInputFiles(photo);
  await page.getByRole("checkbox").check();
  await shot("photo");
  await save.click();

  // No look picked yet, so try a screenshot.
  await page.getByText("Try a screenshot").waitFor();
  await page.getByText("Try a screenshot").locator("input[type=file]").setInputFiles(photo);
  await page.getByRole("heading", { name: "Your screenshot" }).waitFor();
  await page.getByRole("button", { name: "Try this cut on me" }).click();
  if (mode === "unconnected") {
    await page.getByRole("alert").filter({ hasText: "isn't connected" }).waitFor();
    await shot("unconnected");
    console.log("unconnected: honest blocked state shown");
  } else {
    await page.getByRole("slider").waitFor();
    await page.getByText("Demo mode: this is your original photo").waitFor();
    await shot("result");
    await page.getByRole("button", { name: "Shorter", exact: true }).click();
    await page.getByRole("button", { name: "Shorter", exact: true, pressed: true }).waitFor();
    await page.getByRole("list", { name: "This session's renders" }).waitFor();

    await page.getByRole("link", { name: "Make my Barber Brief" }).click();
    await page.getByRole("button", { name: "Make my Barber Brief" }).click();
    await page.getByLabel("Style name").waitFor();
    await page.getByLabel("Top", { exact: true }).fill("Scissor cut, leave length to push back.");
    await shot("brief");
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Share image" }).click();
    const file = await download;
    if (shots) await file.saveAs(path.join(shots, "brief-export.png"));

    // Edits persist, and Saved lists and deletes
    await page.reload();
    assert.equal(await page.getByLabel("Top", { exact: true }).inputValue(), "Scissor cut, leave length to push back.");
    await page.goto(`${base}/saved`);
    await page.getByRole("heading", { name: "Renders" }).waitFor();
    await shot("saved");
    assert.equal(await page.getByRole("button", { name: "Delete" }).count(), 3, "1 brief + 2 renders");
    for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Delete" }).first().click();
    await page.getByRole("heading", { name: "Nothing saved yet" }).waitFor();
    // Analyzer -> hands the screenshot to Try
    await page.goto(`${base}/decode`);
    await page.locator("input[type=file]").first().setInputFiles(photo);
    await page.getByRole("button", { name: "Decode this cut" }).click();
    await page.getByText("Demo mode: no AI looked at this image.").waitFor();
    await shot("decode");
    await page.getByRole("button", { name: "Try it on me" }).click();
    await page.getByRole("heading", { name: "Your screenshot" }).waitFor();

    // Profile: next cut countdown
    await page.goto(`${base}/you`);
    const d = new Date(Date.now() - 21 * 86400000);
    await page.getByLabel("Last cut").fill(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
    await page.getByText("days to go").waitFor();
    assert.equal(await page.locator("span.text-display").innerText(), "7");
    await shot("you");
    console.log("mock: welcome -> discover -> photo -> render -> tweak -> brief -> export -> saved -> delete OK");
  }

  await page.goto(`${base}/you`);
  await page.getByRole("button", { name: "Delete all my data" }).click();
  await page.getByRole("button", { name: "Yes, delete it all" }).click();
  await page.getByText("No photo saved yet.").waitFor();
  assert.deepEqual(errors, [], "no uncaught page errors");
  await browser.close();
})().catch((e) => {
  console.error("E2E FAILED:", e.message);
  process.exit(1);
});
