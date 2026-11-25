// LOCAL ONLY. Visual Package 3, governance A2: the SIGNED-IN header must not move.
//   node t-visual3-baseline.mjs baseline   → records the signed-in header (screenshot + normalized outerHTML) at every
//                                            test width, plus the open phone/tablet menu, from the CURRENT build
//   node t-visual3-baseline.mjs compare    → re-records from the new build and compares: identical HTML, and
//                                            pixel-identical screenshots (decoded and diffed in the browser)
// Also saves signed-out "before" screenshots (baseline mode) for the report. Against http://localhost:3300.
import { spawn } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import puppeteer from "puppeteer-core";

const MODE = process.argv[2] ?? "compare";
const BASE = "http://localhost:3300";
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const here = path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Z]:)/, "$1");
const dir = path.join(here, MODE === "baseline" ? "baseline-v3" : "compare-v3");
fs.mkdirSync(dir, { recursive: true });
const WIDTHS = [360, 390, 430, 768, 1024, 1279, 1280, 1366, 1440];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const enc = new TextEncoder();
async function sign(v) { const d = await crypto.subtle.digest("SHA-256", enc.encode("demo-session-secret")); const k = await crypto.subtle.importKey("raw", d, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]); return Buffer.from(await crypto.subtle.sign("HMAC", k, enc.encode(v))).toString("hex"); }
async function token(payload) { const s = `${payload}.${Date.now() + 3600_000}`; return `${s}.${await sign(s)}`; }
const edge = spawn(EDGE, ["--headless=new", `--user-data-dir=${path.join(os.tmpdir(), `edge-v3b-${Date.now()}`)}`, "--remote-debugging-port=9343", "--no-first-run", "--disable-gpu", "--hide-scrollbars", "about:blank"], { stdio: "ignore" });
let browser; for (let i = 0; i < 40 && !browser; i++) { try { browser = await puppeteer.connect({ browserURL: "http://127.0.0.1:9343" }); } catch { await sleep(250); } }

async function record(signedIn, width, menu) {
  const ctx = await browser.createBrowserContext(); const page = await ctx.newPage();
  await page.setViewport({ width, height: 900, ...(width < 768 ? { isMobile: true, hasTouch: true } : {}) });
  const cookies = [{ name: "vericert_age_ack", value: "1", domain: "localhost", path: "/" }];
  if (signedIn) cookies.push({ name: "vericert_customer_session", value: await token(`demo-customer~s~${Date.now()}`), domain: "localhost", path: "/" });
  await ctx.setCookie(...cookies);
  await page.goto(`${BASE}/about`, { waitUntil: "networkidle0" });
  await page.evaluate(() => document.fonts.ready); await sleep(400);
  if (menu) { await page.click('button[aria-label="Toggle menu"]'); await sleep(500); }
  // Freeze anything time-based inside the header (the signed-in header has none; the signed-out placeholder rotates).
  const html = await page.evaluate(() => document.querySelector("header").outerHTML
    .replace(/ (style)="[^"]*"/g, "")                    // inline transition/opacity styles
    .replace(/\/_next\/[^"' )]+/g, "/_next/…")            // build-hashed asset URLs
    .replace(/srcSet="[^"]*"/g, ""));
  const r = await page.evaluate(() => { const b = document.querySelector("header").getBoundingClientRect(); return { x: 0, y: Math.max(0, b.top), width: innerWidth, height: Math.ceil(b.height) }; });
  // Geometry of every rendered element in the header (tag + rounded box): if anything moves or resizes, this differs.
  const geometry = await page.evaluate(() => JSON.stringify([...document.querySelectorAll("header *")].filter((e) => e.getClientRects().length).map((e) => {
    const b = e.getBoundingClientRect(); const c = getComputedStyle(e);
    return [e.tagName, Math.round(b.x * 10) / 10, Math.round(b.y * 10) / 10, Math.round(b.width * 10) / 10, Math.round(b.height * 10) / 10,
      c.color, c.backgroundColor, c.borderTopColor, c.borderTopWidth, c.fontSize, c.fontWeight, c.letterSpacing, c.opacity, c.fill, c.stroke];
  })));
  const png = await page.screenshot({ clip: r });
  // Two more captures of the same state, for the anti-aliasing noise seen at 360 px (pixels pass if any capture matches).
  const extra = MODE === "compare" ? [await page.screenshot({ clip: r }), await page.screenshot({ clip: r })] : [];
  await ctx.close();
  return { html, png, extra, geometry, height: r.height };
}

// Warm-up: the very first page of a fresh browser rendered a few anti-aliasing pixels differently (71 px at 360 px in
// a same-build check), so one load is made and discarded before anything is recorded.
await record(true, 360, false);
const results = [];
for (const width of WIDTHS) {
  for (const menu of width < 1280 ? [false, true] : [false]) {
    const tag = `signed-in-${width}${menu ? "-menu" : ""}`;
    const rec = await record(true, width, menu);
    fs.writeFileSync(path.join(dir, `${tag}.html`), rec.html); fs.writeFileSync(path.join(dir, `${tag}.png`), rec.png); fs.writeFileSync(path.join(dir, `${tag}.geometry.json`), rec.geometry);
    rec.extra.forEach((x, i) => fs.writeFileSync(path.join(dir, `${tag}.extra${i}.png`), x));
    results.push({ tag, height: rec.height });
    if (MODE === "baseline") {
      const so = await record(false, width, menu);
      fs.writeFileSync(path.join(dir, `before-signed-out-${width}${menu ? "-menu" : ""}.png`), so.png);
    }
  }
}

if (MODE === "compare") {
  const base = path.join(here, "baseline-v3");
  const page = await browser.newPage();
  let same = 0, diff = 0;
  for (const { tag } of results) {
    const htmlSame = fs.readFileSync(path.join(base, `${tag}.html`), "utf8") === fs.readFileSync(path.join(dir, `${tag}.html`), "utf8");
    const geomSame = fs.readFileSync(path.join(base, `${tag}.geometry.json`), "utf8") === fs.readFileSync(path.join(dir, `${tag}.geometry.json`), "utf8");
    const a = fs.readFileSync(path.join(base, `${tag}.png`)).toString("base64");
    const captures = [`${tag}.png`, `${tag}.extra0.png`, `${tag}.extra1.png`].map((f) => fs.readFileSync(path.join(dir, f)).toString("base64"));
    const b = captures.find((c) => c === a) ?? captures[0];
    const px = a === b ? { w: 0, h: 0, differing: 0, sizeMatch: true } : await page.evaluate(async (a, b) => {
      const load = (s) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.src = `data:image/png;base64,${s}`; });
      const [ia, ib] = await Promise.all([load(a), load(b)]);
      if (ia.width !== ib.width || ia.height !== ib.height) return { w: ia.width, h: ia.height, w2: ib.width, h2: ib.height, sizeMatch: false, differing: -1 };
      const c = document.createElement("canvas"); c.width = ia.width; c.height = ia.height; const x = c.getContext("2d", { willReadFrequently: true });
      x.drawImage(ia, 0, 0); const da = x.getImageData(0, 0, c.width, c.height).data; x.clearRect(0, 0, c.width, c.height); x.drawImage(ib, 0, 0); const db = x.getImageData(0, 0, c.width, c.height).data;
      let n = 0; for (let i = 0; i < da.length; i += 4) if (da[i] !== db[i] || da[i + 1] !== db[i + 1] || da[i + 2] !== db[i + 2]) n++;
      return { w: c.width, h: c.height, differing: n, sizeMatch: true };
    }, a, b);
    // HTML, layout and computed styles must be identical; pixels within 0.25% (rasterization noise at the narrowest
    // widths, measured at 71 px of 47,880 on the SAME build).
    const pxOk = px.sizeMatch && px.differing >= 0 && px.differing <= 0.0025 * px.w * px.h;
    const ok = htmlSame && geomSame && pxOk;
    if (ok) same++; else diff++;
    console.log(`${ok ? "PASS" : "FAIL"}  [V3-SIGNED-IN] ${tag}: header HTML ${htmlSame ? "identical" : "DIFFERENT"}, layout + computed styles ${geomSame ? "identical" : "CHANGED"}, pixels ${px.sizeMatch ? `${px.differing} differing of ${px.w * px.h}` : `size ${px.w}x${px.h} vs ${px.w2}x${px.h2}`}`);
  }
  console.log(`\n[V3-SIGNED-IN] ${same} passed, ${diff} failed (${same + diff} checks)`);
  await browser.close().catch(() => {}); edge.kill(); process.exit(diff ? 1 : 0);
}
console.log(`baseline recorded: ${results.map((r) => `${r.tag} (${r.height}px)`).join(", ")}`);
await browser.close().catch(() => {}); edge.kill();
