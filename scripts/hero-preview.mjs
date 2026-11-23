#!/usr/bin/env node
/**
 * Temporary hero candidate previewer. Standalone: not part of the Next app,
 * writes nothing, and never touches public/ or the production hero.
 *
 *   1. Drop candidates in design/candidates/hero/ (png, jpg, webp, avif)
 *   2. node scripts/hero-preview.mjs [port]      (default 4400)
 *   3. Open http://localhost:4400
 *
 * Each candidate shows: the original (with the three crop windows outlined),
 * then the hero at 1440x900, 1920x1080 and 390x844. Every frame is an iframe of
 * exactly that viewport, loading the REAL components/landing/landing.css, so the
 * media queries, portrait masks, glow, arcs and copy are the production rules.
 * Focal sliders start from hero-portrait-01 in design/asset-manifest.json.
 */
import { createServer } from "node:http";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const dir = path.join(root, "design/candidates/hero");
const port = Number(process.argv[2] ?? 4400);
const TYPES = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".avif": "image/avif" };

const manifest = JSON.parse(await readFile(path.join(root, "design/asset-manifest.json"), "utf8"));
const hero = manifest.assets.find((a) => a.id === "hero-portrait-01");
const FOCAL = { d: hero.object_position, m: hero.object_position_mobile };

const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

async function candidates() {
  try {
    return (await readdir(dir)).filter((f) => TYPES[path.extname(f).toLowerCase()]).sort();
  } catch {
    return [];
  }
}

/** One hero frame, using the production class names and CSS. */
function frame(q) {
  const img = q.get("img") ?? "";
  const pos = q.get("pos") ?? "50% 50%";
  const raw = q.get("mode") === "raw";
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;1,400&family=Inter:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/landing.css">
<style>
  :root{--font-hp-display:"Cormorant Garamond";--font-inter:"Inter"}
  html,body{margin:0;background:#080706}
  .hp-enter{animation:none!important}
  .hp-slot__img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:${esc(pos)}}
  ${raw ? ".hp-hero__portrait{-webkit-mask-image:none!important;mask-image:none!important}.hp-hero__glow,.hp-hero__arcs,.hp-hero__copy{display:none!important}" : ""}
</style></head><body>
<div class="hp">
<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
<linearGradient id="hp-arc" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#c9a46a" stop-opacity="0"/><stop offset=".45" stop-color="#e4c58d" stop-opacity=".85"/><stop offset="1" stop-color="#c9a46a" stop-opacity="0"/></linearGradient>
</defs></svg>
<section class="hp-hero">
  <div class="hp-hero__glow"></div>
  <div class="hp-hero__portrait"><div class="hp-slot"><img class="hp-slot__img" src="/img/${encodeURIComponent(img)}" alt=""></div></div>
  <svg class="hp-arcs hp-hero__arcs" viewBox="0 0 1000 800" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <circle cx="640" cy="330" r="300" fill="none" stroke="url(#hp-arc)" stroke-width="1"/>
    <circle cx="640" cy="330" r="352" fill="none" stroke="url(#hp-arc)" stroke-width=".6" opacity=".5"/>
    <path d="M120 820C300 560 620 470 1040 520" fill="none" stroke="url(#hp-arc)" stroke-width=".8" opacity=".7"/>
  </svg>
  <div class="hp-hero__copy">
    <p class="hp-eyebrow">Hairstyle discovery &amp; AI try-on</p>
    <h1 class="hp-display">Discover<br>your <em>next</em><br>hairstyle.</h1>
    <p class="hp-hero__sub">Explore. Try. Transform.</p>
    <div class="hp-hero__actions"><span class="hp-btn hp-btn--solid">Get Started</span></div>
  </div>
</section></div></body></html>`;
}

function index(files) {
  const rows = files.length
    ? files.map((f, i) => `<section class="cand" data-file="${esc(f)}" data-i="${i}"></section>`).join("")
    : `<p class="empty">No candidates yet. Add images to <code>design/candidates/hero/</code> and refresh.</p>`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>Hero candidate preview</title><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  :root{color-scheme:dark}
  body{margin:0;background:#161616;color:#ddd;font:13px/1.5 ui-sans-serif,system-ui,sans-serif}
  header{position:sticky;top:0;z-index:5;display:flex;gap:24px;align-items:center;flex-wrap:wrap;padding:12px 20px;background:#0d0d0d;border-bottom:1px solid #333}
  header b{color:#e4c58d}header label{display:flex;gap:8px;align-items:center}
  .cand{padding:24px 20px 36px;border-bottom:1px solid #2a2a2a}
  .cand h2{margin:0 0 4px;font-size:15px;color:#fff}.meta{color:#999;margin-bottom:14px}
  .ctl{display:flex;gap:28px;flex-wrap:wrap;margin-bottom:16px}
  .ctl fieldset{border:1px solid #333;border-radius:6px;padding:6px 12px;display:flex;gap:14px;align-items:center}
  .ctl legend{color:#999;padding:0 6px}.ctl input[type=range]{width:130px}
  .grid{display:flex;gap:24px;flex-wrap:wrap;align-items:flex-start}
  figure{margin:0}figcaption{margin-bottom:6px;color:#aaa}figcaption a{color:#e4c58d}
  .box{position:relative;overflow:hidden;border:1px solid #444;background:#000}
  .box iframe{position:absolute;left:0;top:0;border:0;transform-origin:0 0}
  .orig{position:relative;display:inline-block;border:1px solid #444;line-height:0}
  .orig img{display:block;max-width:420px;max-height:420px}
  .win{position:absolute;border:1.5px dashed;box-sizing:border-box;pointer-events:none}
  .win span{position:absolute;left:3px;top:2px;font-size:10px;line-height:1.2;padding:1px 4px;background:#000a}
  .empty{padding:40px 20px}code{color:#e4c58d}
</style></head><body>
<header><b>Hero candidate preview</b><span>isolated: no production files are read for display or written</span>
<label>Frame scale <input id="scale" type="range" min="25" max="100" value="45"> <output id="scaleOut">45%</output></label>
<label><input id="raw" type="checkbox"> Raw crop (hide masks, glow, arcs, copy)</label></header>
${rows}
<script>
const FOCAL = ${JSON.stringify(FOCAL)};
const SIZES = [
  { key:"d", name:"Desktop 1440x900", w:1440, h:900 },
  { key:"d", name:"Desktop 1920x1080", w:1920, h:1080 },
  { key:"m", name:"Mobile 390x844", w:390, h:844 },
];
// Portrait slot box per viewport, from landing.css: >=1680 width 60%, else 64% (desktop); mobile 100% x 64svh.
const slot = (w,h) => w < 768 ? { w, h: h*0.64 } : { w: w*(w>=1680?0.60:0.64), h };
const parse = p => p.split(/\\s+/).map(v => parseFloat(v)/100);
const state = {};
const scaleEl = document.getElementById("scale"), rawEl = document.getElementById("raw");
const COLORS = ["#e4c58d","#7ec8e3","#f08a8a"];

document.querySelectorAll(".cand").forEach(sec => {
  const file = sec.dataset.file;
  const s = state[file] = { dx:parse(FOCAL.d)[0]*100, dy:parse(FOCAL.d)[1]*100, mx:parse(FOCAL.m)[0]*100, my:parse(FOCAL.m)[1]*100, nat:null };
  sec.innerHTML = \`<h2></h2><div class="meta"></div>
  <div class="ctl">
    <fieldset><legend>Desktop focal (1440 and 1920)</legend><label>X <input type="range" min="0" max="100" data-k="dx"> <output></output></label><label>Y <input type="range" min="0" max="100" data-k="dy"> <output></output></label></fieldset>
    <fieldset><legend>Mobile focal (390)</legend><label>X <input type="range" min="0" max="100" data-k="mx"> <output></output></label><label>Y <input type="range" min="0" max="100" data-k="my"> <output></output></label></fieldset>
    <fieldset><legend>Integrate command</legend><code class="cmd"></code></fieldset>
  </div>
  <div class="grid"><figure><figcaption>1. Original</figcaption><div class="orig"><img alt=""></div></figure></div>\`;
  sec.querySelector("h2").textContent = file;
  const grid = sec.querySelector(".grid");
  SIZES.forEach((z, idx) => {
    const fig = document.createElement("figure");
    fig.innerHTML = \`<figcaption>\${idx+2}. \${z.name} <a target="_blank">open full size</a></figcaption><div class="box"><iframe width="\${z.w}" height="\${z.h}" loading="lazy"></iframe></div>\`;
    fig.dataset.idx = idx; grid.appendChild(fig);
  });
  const img = sec.querySelector(".orig img");
  img.src = "/img/" + encodeURIComponent(file);
  img.onload = () => { s.nat = [img.naturalWidth, img.naturalHeight]; refresh(sec); };
  sec.querySelectorAll("input[data-k]").forEach(inp => {
    inp.value = s[inp.dataset.k];
    inp.oninput = () => { s[inp.dataset.k] = +inp.value; refresh(sec, true); };
  });
});

function refresh(sec, debounce) {
  const file = sec.dataset.file, s = state[file];
  sec.querySelectorAll("input[data-k]").forEach(i => i.nextElementSibling.textContent = Math.round(s[i.dataset.k]) + "%");
  const dpos = Math.round(s.dx) + "% " + Math.round(s.dy) + "%", mpos = Math.round(s.mx) + "% " + Math.round(s.my) + "%";
  sec.querySelector(".cmd").textContent = 'node scripts/integrate-asset.mjs hero-portrait-01 "design/candidates/hero/' + file + '" --position "' + dpos + '"';
  if (s.nat) sec.querySelector(".meta").textContent = s.nat[0] + "x" + s.nat[1] + " px, " + (s.nat[0]/s.nat[1]).toFixed(3) + " ratio (target 2400x1800, 1.333)" + (s.nat[0] < 2400 ? " - below target width" : "");
  const scale = scaleEl.value/100;
  sec.querySelectorAll("figure[data-idx]").forEach(fig => {
    const z = SIZES[+fig.dataset.idx], pos = z.key === "d" ? dpos : mpos;
    const box = fig.querySelector(".box"), fr = fig.querySelector("iframe");
    box.style.width = z.w*scale + "px"; box.style.height = z.h*scale + "px";
    fr.style.transform = "scale(" + scale + ")";
    const url = "/frame?img=" + encodeURIComponent(file) + "&pos=" + encodeURIComponent(pos) + (rawEl.checked ? "&mode=raw" : "");
    fig.querySelector("a").href = url;
    clearTimeout(fr._t);
    const set = () => { if (fr.dataset.url !== url) { fr.dataset.url = url; fr.src = url; } };
    debounce ? (fr._t = setTimeout(set, 120)) : set();
  });
  // Crop windows on the original: cover-fit of each slot box, placed by that viewport's focal point.
  const orig = sec.querySelector(".orig"); orig.querySelectorAll(".win").forEach(n => n.remove());
  if (!s.nat) return;
  const [iw, ih] = s.nat;
  SIZES.forEach((z, i) => {
    const b = slot(z.w, z.h), [fx, fy] = parse(z.key === "d" ? dpos : mpos);
    const k = Math.max(b.w/iw, b.h/ih), vw = b.w/k, vh = b.h/k;
    const w = document.createElement("div"); w.className = "win"; w.style.borderColor = COLORS[i];
    w.style.left = ((iw-vw)*fx/iw*100) + "%"; w.style.top = ((ih-vh)*fy/ih*100) + "%";
    w.style.width = (vw/iw*100) + "%"; w.style.height = (vh/ih*100) + "%";
    w.innerHTML = "<span style='color:" + COLORS[i] + "'>" + z.name.split(" ")[1] + "</span>";
    orig.appendChild(w);
  });
}
const all = () => document.querySelectorAll(".cand").forEach(sec => refresh(sec));
scaleEl.oninput = () => { document.getElementById("scaleOut").textContent = scaleEl.value + "%"; all(); };
rawEl.onchange = all;
all();
</script></body></html>`;
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  const send = (status, type, body) => {
    res.writeHead(status, { "content-type": type, "cache-control": "no-store" });
    res.end(body);
  };
  try {
    if (url.pathname === "/") return send(200, "text/html; charset=utf-8", index(await candidates()));
    if (url.pathname === "/frame") return send(200, "text/html; charset=utf-8", frame(url.searchParams));
    if (url.pathname === "/landing.css") return send(200, "text/css", await readFile(path.join(root, "components/landing/landing.css")));
    if (url.pathname.startsWith("/img/")) {
      const name = path.basename(decodeURIComponent(url.pathname.slice(5)));
      const type = TYPES[path.extname(name).toLowerCase()];
      if (!type) return send(404, "text/plain", "not found");
      return send(200, type, await readFile(path.join(dir, name)));
    }
    send(404, "text/plain", "not found");
  } catch {
    send(404, "text/plain", "not found");
  }
}).listen(port, "127.0.0.1", () => console.log(`Hero preview: http://localhost:${port}  (candidates: design/candidates/hero/)`));
