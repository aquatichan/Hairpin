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
  const browser = await chromium.launch(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {});
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  // Desktop Chrome on macOS has a native share sheet; the test checks the download fallback instead.
  await page.addInitScript(() => Object.defineProperty(navigator, "canShare", { value: () => false }));
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const shot = (name) => shots && page.screenshot({ path: path.join(shots, `${name}.png`) });

  // Discover shows the library; a look opens its detail sheet and hands its ID to Try.
  await page.goto(`${base}/discover`);
  await page.getByRole("heading", { name: "Discover", level: 1 }).waitFor();
  await shot("gallery");
  await page.getByRole("button", { name: /^Curly top, .*Open details$/ }).click();
  await page.getByRole("heading", { name: "Curly top" }).waitFor();
  await shot("look");
  await page.getByRole("link", { name: "Try this look" }).click();

  // The first try runs the short intro, then continues to the chosen look.
  await page.waitForURL(/\/welcome\?next=/);
  for (let i = 0; i < 2; i++) await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("radio", { name: /^Wavy/ }).click();
  await page.getByRole("radio", { name: /^2B/ }).click();
  await shot("welcome");
  await page.getByRole("button", { name: "Continue to try-on" }).click();
  await page.waitForURL(/\/try\?look=curly-top$/);

  // Photo setup needs both a photo and consent.
  await page.getByRole("heading", { name: "Try", level: 1 }).waitFor();
  await page.waitForLoadState("networkidle"); // a cold dev server hydrates late; a file picked earlier is lost
  await page.locator("input[type=file]").first().setInputFiles(photo);
  const use = page.getByRole("button", { name: "Use this photo" });
  await assert.rejects(use.click({ timeout: 500, trial: true }), "Use this photo must be disabled without consent");
  await page.getByRole("checkbox").check();
  await shot("photo");
  await use.click();
  await page.getByText("Private, kept on this device.").waitFor();

  // The Discover look arrives selected. On publik its reference portrait is not sent: the studio says so and
  // offers the written description, but never switches by itself.
  await page.getByText("Curly top", { exact: true }).first().waitFor();
  await page.getByText("Not available on publik yet").waitFor();
  const generate = page.getByRole("button", { name: "Generate try-on" });
  await assert.rejects(generate.click({ timeout: 500, trial: true }), "generate must be disabled while the reference is blocked");
  await shot("studio-blocked");

  // The server refuses the same request on its own, whatever the client does.
  const api = await page.evaluate(async () => {
    const img = await (await fetch("/assets/gallery/gallery-portrait-03.webp")).blob();
    const post = async (fields) => {
      const f = new FormData();
      f.set("photo", img, "p.webp");
      for (const [k, v] of Object.entries(fields)) f.set(k, v);
      const r = await fetch("/api/tryon", { method: "POST", body: f });
      return { status: r.status, code: (await r.json().catch(() => ({})))?.error?.code ?? null };
    };
    const svg = new FormData();
    svg.set("photo", new Blob(["<svg xmlns='http://www.w3.org/2000/svg'/>"], { type: "image/jpeg" }), "x.jpg");
    svg.set("target", "text");
    svg.set("description", "short crop");
    const bad = await fetch("/api/tryon", { method: "POST", body: svg });
    return {
      reference: await post({ target: "catalog-reference", lookId: "curly-top" }),
      traversal: await post({ target: "catalog-reference", lookId: "../../.env" }),
      url: await post({ target: "catalog-reference", lookId: "https://evil.example/x.png" }),
      svg: bad.status,
    };
  });
  if (mode === "mock") {
    assert.deepEqual(api.reference, { status: 409, code: "reference_unsupported" }, "publik + reference must be refused");
    assert.equal(api.svg, 415, "a non-image disguised as JPEG must be refused");
  }
  assert.equal(api.traversal.status, 404, "path-like look IDs are refused");
  assert.equal(api.url.status, 404, "URL look IDs are refused");

  await page.getByRole("button", { name: "Use the written description" }).click();
  await page.getByRole("radio", { name: /Use the written description/ }).isChecked();
  await generate.click();
  if (mode === "unconnected") {
    await page.getByRole("alert").filter({ hasText: /isn't connected|sign in again/ }).waitFor();
    await shot("unconnected");
    console.log("unconnected: blocked reference, server guards and honest error shown");
  } else {
    await page.getByRole("slider").waitFor();
    await page.getByText("Made from a written description of Curly top. The reference portrait was not sent.").waitFor();
    await page.getByText("Demo mode: this is your original photo").waitFor();
    await shot("result-describe");
    await page.getByRole("button", { name: "Shorter", exact: true }).click();
    await page.getByRole("button", { name: "Shorter", exact: true, pressed: true }).waitFor();
    await page.getByRole("list", { name: "This session's try-ons" }).waitFor();

    // Manual description works on its own.
    await page.getByRole("radio", { name: "Describe", exact: true }).check({ force: true });
    await page.getByLabel("Describe the haircut").fill("Short textured crop with a low fade");
    await page.getByRole("button", { name: "Generate again" }).click();
    await page.getByText("Made from your written description.").waitFor();

    // With the person's own OpenAI key (verified multi-image), the reference portrait is used.
    await page.evaluate(() => localStorage.setItem("hairpin.ai-choice@device", JSON.stringify({ mode: "own", key: "sk-e2e-not-a-real-key" })));
    await page.goto(`${base}/try?look=curly-top`);
    await page.getByText("Most accurate").waitFor();
    await page.getByRole("button", { name: "Generate try-on" }).click();
    await page.getByText("Matched to the reference portrait of Curly top.").waitFor();
    await shot("result-reference");
    await page.evaluate(() => localStorage.setItem("hairpin.ai-choice@device", JSON.stringify({ mode: "publik" })));

    await page.getByRole("link", { name: "Create Barber Brief" }).click();
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
    // Saved: four try-ons and one brief, each deleted only after a confirm.
    await page.goto(`${base}/saved?tab=tryons`);
    await page.getByRole("tab", { name: /Try-ons\s*4/ }).waitFor();
    await page.getByRole("tab", { name: /Briefs\s*1/ }).waitFor();
    await shot("saved-tryons");
    for (let i = 0; i < 4; i++) {
      await page.getByRole("button", { name: /^Delete try-on/ }).first().click();
      await page.getByRole("group", { name: /^Delete / }).getByRole("button", { name: "Delete", exact: true }).click();
    }
    await page.getByRole("heading", { name: "No try-ons yet" }).waitFor();
    await page.getByRole("tab", { name: /Briefs/ }).click();
    await page.getByRole("button", { name: /^Delete brief/ }).click();
    await page.getByRole("group", { name: /^Delete / }).getByRole("button", { name: "Delete", exact: true }).click();
    await page.getByRole("heading", { name: "No Barber Briefs yet" }).waitFor();
    // Analyzer -> hands the screenshot to Try
    await page.goto(`${base}/decode`);
    await page.waitForLoadState("networkidle"); // a cold dev server hydrates late; a file picked earlier is lost
    await page.locator("input[type=file]").first().setInputFiles(photo);
    await page.getByRole("button", { name: "Decode this cut" }).click();
    await page.getByText("Demo mode: no AI looked at this image.").waitFor();
    await shot("decode");
    await page.getByRole("button", { name: "Try it on me" }).click();
    await page.getByRole("img", { name: "Your screenshot" }).waitFor();
    await page.getByRole("button", { name: "Describe it instead" }).waitFor();

    // Profile: next cut countdown
    await page.goto(`${base}/you`);
    const d = new Date(Date.now() - 21 * 86400000);
    await page.getByLabel("Last cut").fill(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
    await page.getByText("days to go").waitFor();
    assert.equal(await page.getByTestId("days-to-go").innerText(), "7");
    await shot("you");
    console.log("mock: welcome -> discover -> photo -> blocked reference -> description -> tweak -> manual text -> own-key reference -> brief -> export -> saved -> decode handoff OK");
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
