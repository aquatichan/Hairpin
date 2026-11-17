/**
 * Renders the preview catalog stills into public/looks from the in-app 3D
 * mannequin. These are illustrations, not AI renders: they stand in for the
 * Discover catalog until the real looks are generated through Publik.
 *
 *   npm run dev            (in another terminal)
 *   node scripts/render-looks.cjs
 */
const { chromium } = require("playwright");
const path = require("node:path");

// Same order as components/head/styles.ts. Pass ids as arguments to re-render only those.
const STYLES = ["buzz", "quiff", "curtains", "afro", "mohawk", "long", "slick", "curls", "bob", "sidepart", "shag", "coils"];
const only = process.argv.slice(2);
const VIEWS = [
  { turn: 0.5, ratio: 1.25 },
  { turn: -0.7, ratio: 1.5 },
  { turn: 2.5, ratio: 1 },
];
const WIDTH = 480;

(async () => {
  const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  for (let style = 0; style < STYLES.length; style++) {
    if (only.length && !only.includes(STYLES[style])) continue;
    for (let v = 0; v < 2; v++) {
      const view = VIEWS[(style + v * 2) % VIEWS.length];
      const page = await browser.newPage({ viewport: { width: WIDTH, height: Math.round(WIDTH * view.ratio) }, deviceScaleFactor: 1.5 });
      await page.goto(`http://localhost:3000/dev/thumb?style=${style}&turn=${view.turn}&time=${style * 7.3 + v * 31}`);
      await page.waitForSelector("html[data-head-ready]");
      await page.waitForTimeout(2500);
      await page.screenshot({ path: path.join(__dirname, "..", "public", "looks", `${STYLES[style]}-${v}.jpg`), type: "jpeg", quality: 82 });
      await page.close();
    }
  }
  await browser.close();
})();
