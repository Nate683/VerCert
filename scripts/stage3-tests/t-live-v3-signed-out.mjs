// LIVE, SIGNED-OUT, NON-MUTATING check of Visual Package 3 on https://vericertpeptides.com (headless Edge, device
// emulation). Waits for the Package 3 build, then checks the header layouts, the phone menu, the registration
// invitation, the shared overlay search, and registration form-state preservation with SYNTHETIC values typed into
// the form — the form is NEVER submitted, and the check fails if any registration request is sent.
// Only page loads, typing and clicks; nothing is created or changed. Screenshots → shots-live-v3/.
import { spawn } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import puppeteer from "puppeteer-core";

const BASE = "https://vericertpeptides.com";
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const shots = path.join(path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Z]:)/, "$1"), "shots-live-v3");
fs.mkdirSync(shots, { recursive: true });
let pass = 0, fail = 0; const failures = [];
const check = (n, ok, d = "") => { if (ok) pass++; else { fail++; failures.push(n); } console.log(`${ok ? "PASS" : "FAIL"}  [LIVE-V3] ${n}${d ? `  — ${d}` : ""}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const edge = spawn(EDGE, ["--headless=new", `--user-data-dir=${path.join(os.tmpdir(), `edge-live-v3-${Date.now()}`)}`, "--remote-debugging-port=9348", "--no-first-run", "--disable-gpu", "about:blank"], { stdio: "ignore" });
let browser; for (let i = 0; i < 40 && !browser; i++) { try { browser = await puppeteer.connect({ browserURL: "http://127.0.0.1:9348" }); } catch { await sleep(250); } }
const pub = await (await fetch(`${BASE}/api/public-catalog`)).json();
const vp = (w, h = 860) => ({ width: w, height: h, ...(w < 768 ? { isMobile: true, hasTouch: true } : {}) });
async function open(viewport) {
  const ctx = await browser.createBrowserContext(); const page = await ctx.newPage(); await page.setViewport(viewport);
  await ctx.setCookie({ name: "vericert_age_ack", value: "1", domain: "vericertpeptides.com", path: "/" }); return { ctx, page };
}
const visibleSearch = (page) => page.evaluateHandle(() => [...document.querySelectorAll("[data-public-search]")].find((e) => e.offsetParent !== null) ?? null);

// Wait (up to ~8 min) for the Package 3 build: the desktop search slot beside the logo.
let live = false;
for (let i = 0; i < 48 && !live; i++) {
  const { ctx, page } = await open(vp(1366));
  await page.goto(`${BASE}/about?v=${Date.now()}`, { waitUntil: "load" }).catch(() => {}); await sleep(2500);
  live = await page.evaluate(() => Boolean(document.querySelector('[data-public-search-slot="desktop"] [data-public-search]'))).catch(() => false);
  await ctx.close(); if (!live) await sleep(10000);
}
check("the Package 3 build is live (compound search beside the logo)", live);

// Desktop: order, placeholder, dropdown anchoring, no count.
for (const w of [1280, 1366]) {
  const { ctx, page } = await open(vp(w));
  await page.goto(`${BASE}/about`, { waitUntil: "load" }); await sleep(1500);
  const order = await page.evaluate(() => { const row = document.querySelector("header").firstElementChild; const vis = (sel) => [...row.querySelectorAll(sel)].find((e) => e.offsetParent !== null);
    const items = [["Logo", vis('a[aria-label="VeriCert home"]')], ["Search", vis("[data-public-search]")], ...[...row.querySelectorAll("nav a")].filter((a) => a.offsetParent !== null).map((a) => [a.innerText.trim(), a]),
      ["VERIFY", vis("nav button[aria-controls]")], ["SIGN IN", [...row.querySelectorAll("a")].find((a) => a.innerText.trim().toUpperCase() === "SIGN IN" && a.offsetParent !== null)], ["Cart", vis('a[href="/cart"]')]];
    return { names: items.map(([n]) => n).join(" → "), xs: items.map(([, e]) => e?.getBoundingClientRect().left ?? null), header: Math.round(document.querySelector("header").getBoundingClientRect().height) }; });
  check(`desktop ${w}: Logo → Search → SHOP → HOW WE TEST → ABOUT → CONTACT → VERIFY → SIGN IN → Cart, header 87px`,
    order.names === "Logo → Search → SHOP → HOW WE TEST → ABOUT → CONTACT → VERIFY → SIGN IN → Cart" && order.xs.every((x, i) => x !== null && (i === 0 || x > order.xs[i - 1])) && order.header === 87, order.names);
  const box = await visibleSearch(page); const input = await box.evaluateHandle((el) => el.querySelector("input"));
  const first = await box.evaluate((el) => el.querySelector("[data-placeholder]")?.innerText);
  await page.screenshot({ path: path.join(shots, `header-desktop-${w}.png`), clip: { x: 0, y: 0, width: w, height: 170 } });
  await input.focus(); await sleep(400);
  const va = await page.evaluate(() => [...document.querySelectorAll("[data-view-all]")].find((b) => b.offsetParent !== null)?.innerText.trim());
  await input.type("glow"); await sleep(800);
  const dd = await page.evaluate(() => { const el = [...document.querySelectorAll("[data-public-search]")].find((e) => e.offsetParent !== null); const f = el.querySelector("[data-public-field]").getBoundingClientRect(); const p = el.querySelector("[data-public-results]").getBoundingClientRect();
    return { fieldLeft: Math.round(f.left), left: Math.round(p.left), right: Math.round(p.right), vw: innerWidth, results: el.querySelectorAll("[data-public-result]").length }; });
  check(`desktop ${w}: "COMPOUNDS & PRICES" first; "VIEW ALL COMPOUNDS & PRICES →" (no count); dropdown from the field's left edge, inside the screen`,
    first === "COMPOUNDS & PRICES" && va === "VIEW ALL COMPOUNDS & PRICES →" && dd.left === dd.fieldLeft && dd.left >= 0 && dd.right <= dd.vw && dd.results >= 1, `${first} | ${va} | ${JSON.stringify(dd)}`);
  if (w === 1366) { await sleep(400); await page.screenshot({ path: path.join(shots, "dropdown-desktop-1366.png") }); }
  await ctx.close();
}

// Tablet unchanged.
{
  const { ctx, page } = await open(vp(1024));
  await page.goto(`${BASE}/about`, { waitUntil: "load" }); await sleep(1500);
  const t = await page.evaluate(() => { const header = document.querySelector("header"); const top = header.firstElementChild.getBoundingClientRect(); const el = [...document.querySelectorAll("[data-public-search]")].find((e) => e.offsetParent !== null); const r = el?.getBoundingClientRect();
    return { inTopRow: Boolean(r && r.top >= top.top && r.bottom <= top.bottom), verify: [...header.querySelectorAll("button[aria-controls]")].filter((b) => b.offsetParent !== null).length, header: Math.round(header.getBoundingClientRect().height) }; });
  check("tablet 1024: unchanged — search in the top row, VERIFY in its own row, header 146px", t.inTopRow && t.verify === 1 && t.header === 146, JSON.stringify(t));
  await ctx.close();
}

// Phone: search in the row, VERIFY first in the menu, its panel opens.
{
  const { ctx, page } = await open(vp(390, 844));
  await page.goto(`${BASE}/about`, { waitUntil: "load" }); await sleep(1500);
  const h = await page.evaluate(() => { const header = document.querySelector("header"); const top = header.firstElementChild.getBoundingClientRect(); const el = [...document.querySelectorAll("[data-public-search]")].find((e) => e.offsetParent !== null); const r = el?.getBoundingClientRect();
    return { below: Boolean(r && r.top >= top.bottom - 1), verify: [...header.querySelectorAll("button[aria-controls]")].filter((b) => b.offsetParent !== null).length, header: Math.round(header.getBoundingClientRect().height), first: el?.querySelector("[data-placeholder]")?.innerText }; });
  check("phone 390: search permanently visible in the second row with \"VIEW COMPOUNDS & PRICES\"; VERIFY not in the rows; header 133px", h.below && h.verify === 0 && h.header === 133 && h.first === "VIEW COMPOUNDS & PRICES", JSON.stringify(h));
  await page.screenshot({ path: path.join(shots, "phone-390-header.png"), clip: { x: 0, y: 0, width: 390, height: 260 } });
  await page.click('button[aria-label="Toggle menu"]'); await sleep(600);
  const m = await page.evaluate(() => { const v = document.querySelector("[data-menu-verify]"); const parent = v?.parentElement; return { first: Boolean(v && [...parent.children].find((c) => c.offsetParent !== null) === v), emblem: Boolean(v?.querySelector('img[src*="Emblem"]')), searches: [...document.querySelectorAll("[data-public-search]")].filter((e) => e.offsetParent !== null).length }; });
  check("phone 390: the menu opens with VERIFY BEFORE YOU BUY first (emblem), the search not duplicated", m.first && m.emblem && m.searches === 1, JSON.stringify(m));
  await page.screenshot({ path: path.join(shots, "phone-390-menu.png"), clip: { x: 0, y: 0, width: 390, height: 560 } });
  await page.evaluate(() => document.querySelector("[data-menu-verify] button").click()); await sleep(800);
  const v = await page.evaluate(() => { const id = document.querySelector("button[aria-controls]")?.getAttribute("aria-controls"); const p = id ? document.getElementById(id) : null; return { menuClosed: !document.querySelector("[data-menu-verify]"), panel: Boolean(p && p.offsetParent !== null) }; });
  check("phone 390: VERIFY from the menu closes the menu and opens the public verification panel", v.menuClosed && v.panel, JSON.stringify(v));
  await ctx.close();
}

// Registration page: invitation, overlay search, and form-state preservation (synthetic values, never submitted).
for (const [label, viewport] of [["desktop", vp(1366)], ["phone", vp(390, 844)]]) {
  const { ctx, page } = await open(viewport);
  const requests = []; page.on("request", (r) => requests.push({ url: r.url(), body: r.postData() ?? "" }));
  let navs = 0;
  await page.goto(`${BASE}/register`, { waitUntil: "load" }); await sleep(1500);
  page.on("framenavigated", (f) => { if (f === page.mainFrame()) navs++; });
  const inv = await page.evaluate(() => { const i = document.querySelector("[data-explore-invitation]"); return i ? { h: i.querySelector("h2").innerText, p: i.querySelector("p").innerText, b: i.querySelector("[data-explore-button]").innerText.replace(/\s+/g, " ").trim(), type: i.querySelector("[data-explore-button]").getAttribute("type") } : null; });
  check(`register ${label}: "Explore before you register" invitation with VIEW COMPOUNDS & PRICES → (type="button")`, inv?.h === "Explore before you register" && inv.p === "Discover our compounds, strengths and pricing. No account required." && inv.b === "VIEW COMPOUNDS & PRICES →" && inv.type === "button", JSON.stringify(inv));
  await page.evaluate(() => document.querySelector("[data-explore-invitation]").scrollIntoView({ block: "center" }));
  await page.screenshot({ path: path.join(shots, `register-${label}.png`) });
  // Synthetic values (never submitted).
  const SYN = { first: "Livecheck", last: "Synthetic", email: `live.check.${Date.now()}@example.invalid`, phone: "(555) 234-5678", pw: "Never-Submitted-7q!" };
  await page.type("#register-first-name", SYN.first); await page.type("#register-last-name", SYN.last); await page.type("#register-email", SYN.email);
  const cat = await page.evaluate(() => [...document.querySelectorAll("#register-research-category option")].map((o) => o.value).filter(Boolean)[0]);
  await page.select("#register-research-category", cat); await page.type("#register-phone", SYN.phone);
  await page.type("#register-password", SYN.pw); await page.type("#register-password-confirm", SYN.pw); await page.click("#register-acknowledgment");
  await page.evaluate(() => { document.querySelector("form").__liveMarker = Math.random().toString(36).slice(2); window.__submits = 0; document.addEventListener("submit", (e) => { window.__submits++; e.preventDefault(); }, true); });
  const snap = () => page.evaluate(() => { const f = document.querySelector("form"); return { marker: f.__liveMarker, controls: [...f.querySelectorAll("input, select")].map((e) => `${e.id}=${e.type === "checkbox" ? e.checked : e.value}`).join("|") }; });
  const base = await snap();
  const openO = async () => { await page.click("[data-explore-button]"); await page.waitForSelector("[data-compound-list]", { visible: true }); await sleep(200); };
  await openO();
  const o = await page.evaluate(() => ({ title: document.querySelector("#compound-list-title").innerText, rows: [...document.querySelectorAll("[data-compound-row]")].map((r) => r.dataset.compoundRow), imgs: document.querySelectorAll("[data-compound-list] img").length, placeholder: document.querySelector("[data-list-search-input]")?.placeholder }));
  check(`register ${label}: the shared overlay opens directly — "VIEW ALL COMPOUNDS & PRICES" (no count), all ${pub.count} compounds alphabetically, no thumbnails, "Search compounds..."`,
    o.title === "VIEW ALL COMPOUNDS & PRICES" && JSON.stringify(o.rows) === JSON.stringify(pub.compounds.map((c) => c.slug)) && o.imgs === 0 && o.placeholder === "Search compounds..." && !o.rows.includes("bac-water"), `${o.rows.length} rows`);
  const search = async (t) => { await page.$eval("[data-list-search-input]", (el) => { el.focus(); el.select(); }); await page.keyboard.press("Backspace"); if (t) await page.type("[data-list-search-input]", t); await sleep(300); return page.evaluate(() => [...document.querySelectorAll("[data-compound-row]")].map((r) => r.dataset.compoundRow)); };
  const cas = pub.compounds.find((c) => /\d{2,7}-\d{2}-\d/.test(c.casNumber ?? "")); const casNo = cas.casNumber.match(/\d{2,7}-\d{2}-\d/)[0];
  const r1 = await search("BPC-157"), r2 = await search("glo"), r3 = await search("no dac"), r4 = await search(casNo), r5 = await search("e");
  check(`register ${label}: overlay search — full name, partial, alternate name, CAS; complete list (> 8 for "e")`, r1.includes("bpc-157") && r2.includes("glow-blend") && r3.includes("cjc-1295-ipamorelin-blend") && r4.includes(cas.slug) && r5.length > 8, `e → ${r5.length}`);
  await page.keyboard.press("Enter"); // must not submit anything
  await search("zzzz");
  const none = await page.evaluate(() => document.querySelector("[data-list-empty]")?.innerText);
  if (label === "desktop") await page.screenshot({ path: path.join(shots, "overlay-no-results-desktop.png") });
  await page.click("[data-list-search-clear]"); await sleep(300);
  const cleared = await page.evaluate(() => document.querySelectorAll("[data-compound-row]").length);
  check(`register ${label}: "No matching compounds found." then clear restores the full list`, none === "No matching compounds found." && cleared === pub.count, `${none} | ${cleared}`);
  await page.keyboard.press("Escape"); await sleep(400);
  const afterEsc = await snap(); const focusEsc = await page.evaluate(() => document.activeElement?.hasAttribute("data-explore-button"));
  await openO(); await page.click("[data-close-list]"); await sleep(400); const afterX = await snap();
  await openO(); await page.click('[data-compound-row] [data-list-name]'); await sleep(500); const afterPick = await snap(); const focusPick = await page.evaluate(() => document.activeElement?.id);
  await openO(); await page.click("[data-list-cta]"); await sleep(500); const afterCta = await snap();
  const st = await page.evaluate(() => ({ submits: window.__submits, url: location.pathname, store: JSON.stringify({ ls: { ...localStorage }, ss: { ...sessionStorage }, c: document.cookie }) }));
  const same = [afterEsc, afterX, afterPick, afterCta].every((s) => s.marker === base.marker && s.controls === base.controls);
  check(`register ${label}: form values, checkboxes and the same form element kept through Escape, ×, selecting a compound and CREATE YOUR FREE ACCOUNT`, same && focusEsc && focusPick === "register-form-heading", `focus after Escape on invitation: ${focusEsc}; after selection: ${focusPick}`);
  const leaked = [SYN.first, SYN.last, SYN.email, SYN.pw].some((v) => st.store.includes(v) || requests.some((r) => r.url.includes(v) || r.body.includes(v)));
  check(`register ${label}: no submit, no navigation, no registration request, nothing entered in storage, URL or any request`, st.submits === 0 && navs === 0 && st.url === "/register" && !requests.some((r) => /\/api\/auth\/register/.test(r.url)) && !leaked, `submits ${st.submits}, navigations ${navs}, ${requests.length} requests checked`);
  await ctx.close(); // the synthetic entries are discarded with the browser context; nothing was sent
}

// Overlay from the header on a non-registration page still routes to /register.
{
  const { ctx, page } = await open(vp(1366));
  await page.goto(`${BASE}/about`, { waitUntil: "load" }); await sleep(1500);
  const box = await visibleSearch(page); await (await box.evaluateHandle((el) => el.querySelector("input"))).focus(); await sleep(400);
  await page.evaluate(() => [...document.querySelectorAll("[data-view-all]")].find((b) => b.offsetParent !== null).click());
  await page.waitForSelector("[data-compound-list]", { visible: true }); await sleep(300);
  await page.screenshot({ path: path.join(shots, "overlay-from-header-desktop.png") });
  await Promise.all([page.waitForNavigation({ waitUntil: "load" }), page.click("[data-list-cta]")]);
  check("overlay from the header on /about: CREATE YOUR FREE ACCOUNT goes to /register", new URL(page.url()).pathname === "/register");
  await ctx.close();
}

await browser.close().catch(() => {}); edge.kill();
console.log(`\n[LIVE-V3] ${pass} passed, ${fail} failed (${pass + fail} checks)${failures.length ? `\nFAILED: ${failures.join(" | ")}` : ""}`);
process.exit(fail ? 1 : 0);
