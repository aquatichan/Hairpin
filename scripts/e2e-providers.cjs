/**
 * Own keys for OpenAI, Gemini and OpenRouter, and the free try-ons per IP, against a demo-mode dev server:
 *   PUBLIK_MOCK=1 npx next dev -p 3211      then      BASE_URL=http://localhost:3211 node scripts/e2e-providers.cjs
 * Demo mode makes no provider call; it checks what the studio offers, what the request carries and the free counts.
 */
const { chromium } = require("playwright");
const path = require("node:path");
const assert = require("node:assert");

const base = process.env.BASE_URL ?? "http://localhost:3211";
const shots = process.env.SHOTS;
const photo = path.join(__dirname, "fixtures", "photo.jpg");
const CHOICE = "hairpin.ai-choice@device";

(async () => {
  const browser = await chromium.launch(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {});
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  // A fresh "IP" per run, so the dev server's counts from earlier runs don't matter.
  const ip = `198.51.100.${Math.floor(Math.random() * 250) + 1}`;
  await page.setExtraHTTPHeaders({ "x-forwarded-for": ip });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const shot = (name) => shots && page.screenshot({ path: path.join(shots, `${name}.png`), fullPage: true });
  const sent = [];
  page.on("request", (r) => r.url().endsWith("/api/tryon") && r.method() === "POST" && sent.push(r.headers()));
  const choose = (choice) => page.evaluate(([k, c]) => localStorage.setItem(k, JSON.stringify(c)), [CHOICE, choice]);

  // Onboarded, with a photo.
  await page.goto(`${base}/privacy`);
  await page.evaluate(() => localStorage.setItem("hairpin:profile@device", JSON.stringify({ onboardedAt: Date.now(), length: null, texture: null, lastCut: null, everyWeeks: 4 })));
  await page.goto(`${base}/try?look=curly-top`);
  const choosePhoto = page.getByRole("button", { name: "Choose a photo" });
  await choosePhoto.or(page.getByText("Private, kept on this device.")).first().waitFor();
  if (await choosePhoto.isVisible()) {
    await page.waitForLoadState("networkidle"); // a cold dev server hydrates late; a file picked earlier is lost
    await page.locator("input[type=file]").first().setInputFiles(photo);
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Use this photo" }).click();
  }
  await page.getByText("Private, kept on this device.").waitFor();

  // Gemini: verified two-image edits, so the reference portrait is offered and sent.
  await choose({ mode: "own", vendor: "gemini", key: "AIza" + "x".repeat(35) });
  await page.goto(`${base}/try?look=curly-top`);
  await page.getByText("Most accurate").waitFor();
  await page.getByText("Billed to your own Google Gemini key.").waitFor();
  await page.getByRole("button", { name: "Generate try-on" }).click();
  await page.getByText("Matched to the reference portrait of Curly top.").waitFor();
  assert.equal(sent.at(-1)["x-hairpin-own-vendor"], "gemini");
  assert.ok(sent.at(-1)["x-hairpin-own-key"].startsWith("AIza"));

  // OpenRouter: one image only; the reference is refused with the provider named, and the description works.
  await choose({ mode: "own", vendor: "openrouter", key: "sk-or-" + "x".repeat(40) });
  await page.goto(`${base}/try?look=curly-top`);
  await page.getByText("Not available on OpenRouter yet").waitFor();
  await page.getByText(/OpenRouter hasn't confirmed that yet/).waitFor();
  await shot("openrouter-blocked");
  const refused = await page.evaluate(async () => {
    const f = new FormData();
    f.set("photo", await (await fetch("/assets/gallery/gallery-portrait-03.webp")).blob(), "p.webp");
    f.set("target", "catalog-reference");
    f.set("lookId", "curly-top");
    const r = await fetch("/api/tryon", { method: "POST", body: f, headers: { "x-hairpin-own-key": "sk-or-" + "x".repeat(40), "x-hairpin-own-vendor": "openrouter" } });
    return { status: r.status, code: (await r.json()).error.code };
  });
  assert.deepEqual(refused, { status: 409, code: "reference_unsupported" }, "server refuses two images for OpenRouter too");
  await page.getByRole("button", { name: "Use the written description" }).first().click();
  await page.getByText("Billed to your own OpenRouter key.").waitFor();
  await page.getByRole("button", { name: "Generate try-on" }).click();
  await page.getByText("Made from a written description of Curly top.", { exact: false }).waitFor();
  assert.equal(sent.at(-1)["x-hairpin-own-vendor"], "openrouter");

  // Anthropic: Claude can't make images. The studio says so up front and the server refuses any try-on.
  await choose({ mode: "own", vendor: "anthropic", key: "sk-ant-" + "x".repeat(40) });
  await page.goto(`${base}/try?look=curly-top`);
  await page.getByText(/Claude can't make images/).first().waitFor();
  await page.getByText("Your Anthropic key covers Decode and Barber Briefs.").waitFor();
  assert.ok(await page.getByRole("button", { name: "Generate try-on" }).isDisabled());
  await shot("anthropic-studio");
  const claude = await page.evaluate(async () => {
    const f = new FormData();
    f.set("photo", await (await fetch("/assets/gallery/gallery-portrait-03.webp")).blob(), "p.webp");
    f.set("target", "text");
    f.set("description", "short textured crop");
    const r = await fetch("/api/tryon", { method: "POST", body: f, headers: { "x-hairpin-own-key": "sk-ant-" + "x".repeat(40), "x-hairpin-own-vendor": "anthropic" } });
    return { status: r.status, code: (await r.json()).error.code };
  });
  assert.deepEqual(claude, { status: 409, code: "provider_cannot_render" });

  // Old saved choice without a provider still works, as OpenAI.
  await choose({ mode: "own", key: "sk-" + "x".repeat(40) });
  await page.goto(`${base}/try?look=curly-top`);
  await page.getByText("Billed to your own OpenAI key.").waitFor();

  // Free: 3 per IP, counted on the server, then the studio asks for a plan or a key.
  await choose({ mode: "free" });
  await page.goto(`${base}/try?look=curly-top`);
  await page.getByText("Free: 3 of 3 try-ons left on this connection.").waitFor();
  await shot("free-3-left");
  await page.getByRole("button", { name: "Generate try-on" }).click();
  await page.getByText("Matched to the reference portrait of Curly top.").waitFor();
  assert.equal(sent.at(-1)["x-hairpin-free"], "1");
  assert.equal(sent.at(-1)["x-hairpin-own-key"], undefined, "no key is sent in free mode");
  for (let i = 0; i < 2; i++) {
    await page.getByRole("button", { name: "Generate again" }).click();
    await page.getByRole("list", { name: "This session's try-ons" }).locator("li").nth(i + 1).waitFor();
  }
  await page.getByRole("button", { name: "Generate again" }).isDisabled();
  assert.equal((await page.evaluate(async () => (await (await fetch("/api/tryon/free")).json()).remaining)), 0);
  const fourth = await page.evaluate(async () => {
    const f = new FormData();
    f.set("photo", await (await fetch("/assets/gallery/gallery-portrait-03.webp")).blob(), "p.webp");
    f.set("target", "catalog-describe");
    f.set("lookId", "curly-top");
    const r = await fetch("/api/tryon", { method: "POST", body: f, headers: { "x-hairpin-free": "1" } });
    return { status: r.status, code: (await r.json()).error.code };
  });
  assert.deepEqual(fourth, { status: 402, code: "free_used" });
  await page.goto(`${base}/try?look=curly-top`);
  await page.getByText("Your free try-ons are used up.").waitFor();
  await page.getByRole("button", { name: "Choose a plan or your own key" }).waitFor();
  await shot("free-used");
  // Another connection still has its own three.
  await page.setExtraHTTPHeaders({ "x-forwarded-for": `203.0.113.${Math.floor(Math.random() * 250) + 1}` });
  assert.equal((await page.evaluate(async () => (await (await fetch("/api/tryon/free")).json()).remaining)), 3);

  assert.deepEqual(errors, [], "no uncaught page errors");
  console.log("providers: gemini reference -> openrouter one-image + server refusal -> anthropic no try-ons -> legacy openai choice -> free 3 per IP then used up OK");
  await browser.close();
})().catch((e) => {
  console.error("E2E FAILED:", e.message);
  process.exit(1);
});
