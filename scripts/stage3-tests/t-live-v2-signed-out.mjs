// LIVE, SIGNED-OUT, NON-MUTATING check of Visual Package 2 on https://vericertpeptides.com: waits for the new build,
// then checks the search field, both placeholder phrases (desktop 1366 / 1280, phone 390), the View All label and the
// overlay. Page loads and opening the search only; nothing is created or changed. Screenshots → shots-live-v2/.
import { spawn } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import puppeteer from "puppeteer-core";

const BASE = "https://vericertpeptides.com";
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const shots = path.join(path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Z]:)/, "$1"), "shots-live-v2");
fs.mkdirSync(shots, { recursive: true });
let pass = 0, fail = 0; const failures = [];
const check = (n, ok, d = "") => { if (ok) pass++; else { fail++; failures.push(n); } console.log(`${ok ? "PASS" : "FAIL"}  [LIVE-V2] ${n}${d ? `  — ${d}` : ""}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const edge = spawn(EDGE, ["--headless=new", `--user-data-dir=${path.join(os.tmpdir(), `edge-live-v2-${Date.now()}`)}`, "--remote-debugging-port=9342", "--no-first-run", "--disable-gpu", "about:blank"], { stdio: "ignore" });
let browser; for (let i = 0; i < 40 && !browser; i++) { try { browser = await puppeteer.connect({ browserURL: "http://127.0.0.1:9342" }); } catch { await sleep(250); } }
const count = (await (await fetch(`${BASE}/api/public-catalog`)).json()).count;

async function open(viewport) {
  const ctx = await browser.createBrowserContext(); const page = await ctx.newPage(); await page.setViewport(viewport);
  await ctx.setCookie({ name: "vericert_age_ack", value: "1", domain: "vericertpeptides.com", path: "/" }); return { ctx, page };
}
const placeholder = (page) => page.evaluate(() => { const el = [...document.querySelectorAll("[data-public-search]")].find((e) => e.offsetParent !== null);
  const s = el?.querySelector("[data-placeholder]"); const f = el?.querySelector("[data-public-field]");
  return s ? { t: s.innerText, o: Number(getComputedStyle(s).opacity), bg: getComputedStyle(f).backgroundColor, inner: [...s.children].map((c) => getComputedStyle(c).display !== "none" ? { w: c.scrollWidth, cw: c.clientWidth } : null).find(Boolean) } : null; }).catch(() => null);

// Wait (up to ~6 min) for the deploy: the new field has the slate background.
let live = false;
for (let i = 0; i < 36 && !live; i++) {
  const { ctx, page } = await open({ width: 1366, height: 860 });
  await page.goto(`${BASE}/about?v=${Date.now()}`, { waitUntil: "load" }).catch(() => {}); await sleep(2500);
  const p = await placeholder(page); live = p?.bg === "rgb(34, 50, 85)";
  await ctx.close(); if (!live) await sleep(10000);
}
check("the new build is live (slate-blue search field)", live);

for (const [label, viewport, pricing] of [["desktop-1366", { width: 1366, height: 860 }, "COMPOUNDS & PRICES"], ["desktop-1280", { width: 1280, height: 800 }, "COMPOUNDS & PRICES"], ["phone-390", { width: 390, height: 844, isMobile: true, hasTouch: true }, "VIEW COMPOUNDS & PRICES"]]) {
  const { ctx, page } = await open(viewport);
  await page.goto(`${BASE}/about`, { waitUntil: "load" }); await sleep(1500);
  // Package 3: on a phone the search is in the header row — no need to open the menu.
  const seen = {}; const t0 = Date.now();
  while (Date.now() - t0 < 9000 && Object.keys(seen).length < 2) { const p = await placeholder(page); if (p && p.o === 1) seen[p.t] ??= p; await sleep(100); }
  const v = seen[pricing], s = seen["SEARCH COMPOUNDS"];
  check(`${label}: "${pricing}" shown in full (no clipping)`, Boolean(v) && v.inner.w <= v.inner.cw, v ? `${v.inner.w}px in ${v.inner.cw}px` : "not seen");
  check(`${label}: "SEARCH COMPOUNDS" shown in full`, Boolean(s) && s.inner.w <= s.inner.cw, s ? `${s.inner.w}px in ${s.inner.cw}px` : "not seen");
  for (const [want, file] of [[pricing, "pricing"], ["SEARCH COMPOUNDS", "search"]]) {
    for (let i = 0; i < 120; i++) { const p = await placeholder(page); if (p?.t === want && p.o === 1) break; await sleep(100); }
    const clip = await page.evaluate(() => { const r = [...document.querySelectorAll("[data-public-field]")].find((e) => e.offsetParent !== null).getBoundingClientRect(); return { x: Math.max(0, r.x - 30), y: Math.max(0, r.y - 18), width: r.width + 60, height: r.height + 36 }; });
    await page.screenshot({ path: path.join(shots, `placeholder-${file}-${label}.png`), clip: { ...clip, width: Math.min(viewport.width - clip.x, clip.width) } });
  }
  if (label === "desktop-1366") {
    const input = await page.evaluateHandle(() => [...document.querySelectorAll("[data-public-search]")].find((e) => e.offsetParent !== null).querySelector("input"));
    await input.focus(); await sleep(400);
    const va = await page.evaluate(() => [...document.querySelectorAll("[data-view-all]")].find((b) => b.offsetParent !== null)?.innerText.trim());
    check(`View All action reads "VIEW ALL COMPOUNDS & PRICES →" (Package 3: no count)`, va === "VIEW ALL COMPOUNDS & PRICES →", va);
    await input.type("glow"); await sleep(600);
    const d = await page.evaluate(() => ({ note: document.querySelector("[data-register-note]")?.innerText.trim(), thumb: document.querySelector("[data-public-thumb] img") ? getComputedStyle(document.querySelector("[data-public-thumb] img")).objectFit : null }));
    check("dropdown: registration note and whole-image thumbnails", d.note === "Select a compound to view details — free registration required." && d.thumb === "contain", JSON.stringify(d));
    await page.screenshot({ path: path.join(shots, "dropdown-desktop.png") });
    await page.evaluate(() => [...document.querySelectorAll("[data-view-all]")].find((b) => b.offsetParent !== null).click());
    await page.waitForSelector("[data-compound-list]", { visible: true });
    const o = await page.evaluate(() => ({ rows: document.querySelectorAll("[data-compound-row]").length, cta: document.querySelector("[data-list-cta]")?.innerText.trim(), imgs: document.querySelectorAll("[data-compound-list] img").length }));
    check(`View All overlay: ${count} rows, no thumbnails, CREATE YOUR FREE ACCOUNT`, o.rows === count && o.imgs === 0 && o.cta === "CREATE YOUR FREE ACCOUNT", JSON.stringify(o));
    await page.screenshot({ path: path.join(shots, "view-all-desktop.png") });
  }
  check(`${label}: no horizontal scroll`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await ctx.close();
}
await browser.close().catch(() => {}); edge.kill();
console.log(`\n[LIVE-V2] ${pass} passed, ${fail} failed (${pass + fail} checks)${failures.length ? `\nFAILED: ${failures.join(" | ")}` : ""}`);
process.exit(fail ? 1 : 0);
