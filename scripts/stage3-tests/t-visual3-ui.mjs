// LOCAL ONLY. Website Visual Refinements Package 3 — browser tests (headless Edge, device EMULATION via viewport
// size/touch; not real devices) against http://localhost:3300 (SNAP=ref1 bash cycle.sh) and the local test DB.
// Sections: A desktop header · B tablet · C phone header · D registration invitation · E MANDATORY form-state
// preservation · F shared overlay search · G Coming Soon · H responsive sweep. Screenshots → shots-v3/.
import { spawn } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import pg from "pg";
import puppeteer from "puppeteer-core";

const BASE = "http://localhost:3300";
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const here = path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Z]:)/, "$1");
const shots = path.join(here, "shots-v3");
fs.mkdirSync(shots, { recursive: true });
const edge = spawn(EDGE, ["--headless=new", `--user-data-dir=${path.join(os.tmpdir(), `edge-v3-${Date.now()}`)}`, "--remote-debugging-port=9344", "--no-first-run", "--disable-gpu", "about:blank"], { stdio: "ignore" });
const pool = new pg.Pool({ host: "127.0.0.1", port: 5491, user: "demo", password: "demo", database: "demo", max: 3 });
const q = async (t, p = []) => (await pool.query(t, p)).rows;
let pass = 0, fail = 0; const failures = []; const M = [];
const check = (name, ok, detail = "") => { if (ok) pass++; else { fail++; failures.push(name); } console.log(`${ok ? "PASS" : "FAIL"}  [V3] ${name}${detail ? `  — ${detail}` : ""}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const enc = new TextEncoder();
async function sign(v) { const d = await crypto.subtle.digest("SHA-256", enc.encode("demo-session-secret")); const k = await crypto.subtle.importKey("raw", d, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]); return Buffer.from(await crypto.subtle.sign("HMAC", k, enc.encode(v))).toString("hex"); }
async function token(payload) { const s = `${payload}.${Date.now() + 3600_000}`; return `${s}.${await sign(s)}`; }
let browser; for (let i = 0; i < 40 && !browser; i++) { try { browser = await puppeteer.connect({ browserURL: "http://127.0.0.1:9344" }); } catch { await sleep(250); } }
if (!browser) throw new Error("Edge did not start");
const vp = (w, h = 860) => ({ width: w, height: h, ...(w < 768 ? { isMobile: true, hasTouch: true } : {}) });
async function open(viewport, userPayload = null) {
  const ctx = await browser.createBrowserContext(); const page = await ctx.newPage(); await page.setViewport(viewport);
  const cookies = [{ name: "vericert_age_ack", value: "1", domain: "localhost", path: "/" }];
  if (userPayload) cookies.push({ name: "vericert_customer_session", value: await token(userPayload), domain: "localhost", path: "/" });
  await ctx.setCookie(...cookies); return { ctx, page };
}
const noHScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
const pub = await (await fetch(`${BASE}/api/public-catalog`)).json();
const COUNT = pub.count;
const visibleSearch = (page) => page.evaluateHandle(() => [...document.querySelectorAll("[data-public-search]")].find((e) => e.offsetParent !== null) ?? null);
const placeholderText = (page) => page.evaluate(() => { const el = [...document.querySelectorAll("[data-public-search]")].find((e) => e.offsetParent !== null); const s = el?.querySelector("[data-placeholder]"); return s ? { t: s.innerText, o: Number(getComputedStyle(s).opacity) } : null; }).catch(() => undefined);
// Contrast helper installed in the page: computed colour composited over the real background stack, WCAG ratio.
const installContrast = (page) => page.evaluate(() => {
  const cv = document.createElement("canvas"); cv.width = cv.height = 1; const cx = cv.getContext("2d", { willReadFrequently: true });
  const parse = (c) => { cx.clearRect(0, 0, 1, 1); cx.fillStyle = "rgba(0,0,0,0)"; cx.fillStyle = c; cx.fillRect(0, 0, 1, 1); const d = cx.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255]; };
  const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const blend = (top, under) => under.map((v, i) => v * (1 - top[3]) + top[i] * top[3]);
  const hex = (c) => "#" + c.slice(0, 3).map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
  window.__bg = (el) => { let bg = [255, 255, 255]; const chain = []; for (let n = el; n; n = n.parentElement) chain.unshift(n); for (const n of chain) { const c = parse(getComputedStyle(n).backgroundColor); if (c[3] > 0) bg = blend(c, bg); } return bg; };
  window.__contrast = (el) => { const bg = window.__bg(el); const fg = blend(parse(getComputedStyle(el).color), bg); const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x); return { fg: hex(fg), bg: hex(bg), ratio: Math.round(((a + 0.05) / (b + 0.05)) * 100) / 100 }; };
  window.__rgb = (c) => hex(parse(c));
});

// ================= A. Signed-out desktop header =================
for (const w of [1280, 1366, 1440]) {
  const { ctx, page } = await open(vp(w));
  await page.goto(`${BASE}/about`, { waitUntil: "networkidle0" });
  await installContrast(page);
  const order = await page.evaluate(() => {
    const header = document.querySelector("header"); const row = header.firstElementChild;
    const box = (el) => (el && el.getClientRects().length ? el.getBoundingClientRect() : null);
    const vis = (sel) => [...row.querySelectorAll(sel)].find((e) => e.offsetParent !== null);
    const navLinks = [...row.querySelectorAll("nav a")].filter((a) => a.offsetParent !== null);
    const items = [
      ["Logo", vis('a[aria-label="VeriCert home"]')],
      ["Compound Search", vis("[data-public-search]")],
      ...navLinks.map((a) => [a.innerText.trim(), a]),
      ["Verify Before You Buy", vis("nav button[aria-controls]")],
      ["Sign In", [...row.querySelectorAll("a")].find((a) => a.innerText.trim().toUpperCase() === "SIGN IN" && a.offsetParent !== null)],
      ["Cart", vis('a[href="/cart"]')],
    ];
    return { items: items.map(([n, el]) => ({ n, x: box(el)?.left ?? null })), header: Math.round(header.getBoundingClientRect().height),
      field: (() => { const f = vis("[data-public-field]"); const r = f.getBoundingClientRect(); const cs = getComputedStyle(f); return { w: Math.round(r.width), h: Math.round(r.height * 10) / 10, bg: window.__rgb(cs.backgroundColor), border: cs.borderTopWidth }; })() };
  });
  const names = order.items.map((i) => i.n).join(" → ");
  const xs = order.items.map((i) => i.x);
  check(`desktop ${w}: order Logo → Compound Search → SHOP → HOW WE TEST → ABOUT → CONTACT → VERIFY → SIGN IN → CART`,
    names === "Logo → Compound Search → SHOP → HOW WE TEST → ABOUT → CONTACT → Verify Before You Buy → Sign In → Cart" && xs.every((x, i) => x !== null && (i === 0 || x > xs[i - 1])), `${names} @ ${xs.map((x) => Math.round(x)).join(",")}`);
  check(`desktop ${w}: header 87px, field 204×41.5 slate blue with 1px gold border, no horizontal scroll`, order.header === 87 && order.field.w === 204 && order.field.h === 41.5 && order.field.bg === "#223255" && order.field.border === "1px" && (await noHScroll(page)), JSON.stringify(order.field));
  // Placeholder: phrases, first phrase, timing, fit.
  const first = await placeholderText(page);
  check(`desktop ${w}: "COMPOUNDS & PRICES" first`, first?.t === "COMPOUNDS & PRICES", first?.t);
  const seen = {}; const changes = []; let last = null; let minO = 1; const t0 = Date.now();
  while (Date.now() - t0 < 15500) { const s = await placeholderText(page); if (s) { minO = Math.min(minO, s.o); if (s.o === 1) seen[s.t] ??= true; if (s.t !== last) { changes.push({ t: s.t, at: Date.now() - t0 }); last = s.t; } } await sleep(50); }
  const holds = changes.slice(1, -1).map((c, i) => ({ t: c.t, ms: changes[i + 2].at - c.at }));
  const vh = holds.filter((h) => h.t === "COMPOUNDS & PRICES").map((h) => h.ms), sh = holds.filter((h) => h.t === "SEARCH COMPOUNDS").map((h) => h.ms);
  check(`desktop ${w}: both phrases, gold ≈4.8 s / gray ≈2.8 s per cycle (incl. 300 ms fade), soft fade`, seen["COMPOUNDS & PRICES"] && seen["SEARCH COMPOUNDS"] && vh.length && sh.length && Math.min(...vh) > 4400 && Math.max(...sh) < 3200 && minO < 0.6, `gold ${vh.join("/")} gray ${sh.join("/")} min opacity ${minO.toFixed(2)}`);
  const fit = await page.evaluate(() => { const el = [...document.querySelectorAll("[data-public-search]")].find((e) => e.offsetParent !== null); const s = el.querySelector("[data-placeholder]"); const cs = getComputedStyle(s);
    const m = (t) => { const x = document.createElement("span"); x.textContent = t; Object.assign(x.style, { position: "absolute", visibility: "hidden", whiteSpace: "nowrap", font: cs.font, letterSpacing: cs.letterSpacing, textTransform: cs.textTransform }); document.body.appendChild(x); const r = x.getBoundingClientRect().width; x.remove(); return Math.ceil(r); };
    return { room: s.clientWidth, gold: m("COMPOUNDS & PRICES"), gray: m("SEARCH COMPOUNDS") }; });
  check(`desktop ${w}: both phrases fit (gold ${fit.gold}px, gray ${fit.gray}px in ${fit.room}px)`, fit.gold <= fit.room && fit.gray <= fit.room);
  if (w === 1280) M.push(`desktop placeholder room ${fit.room}px: "COMPOUNDS & PRICES" ${fit.gold}px (${fit.room - fit.gold}px spare), "SEARCH COMPOUNDS" ${fit.gray}px`);
  await page.screenshot({ path: path.join(shots, `A-header-signed-out-${w}.png`), clip: { x: 0, y: 0, width: w, height: 170 } });
  // Focus stops rotation.
  const box = await visibleSearch(page); const input = await box.evaluateHandle((el) => el.querySelector("input"));
  await input.focus(); const at = (await placeholderText(page))?.t; const frozen = new Set(); for (let i = 0; i < 40; i++) { frozen.add((await placeholderText(page))?.t); await sleep(100); }
  check(`desktop ${w}: rotation stops on focus`, frozen.size === 1 && frozen.has(at), [...frozen].join(" / "));
  // Dropdown anchored under the field, inside the viewport.
  await input.type("bpc"); await sleep(500);
  const dd = await page.evaluate(() => { const el = [...document.querySelectorAll("[data-public-search]")].find((e) => e.offsetParent !== null); const f = el.querySelector("[data-public-field]").getBoundingClientRect(); const p = el.querySelector("[data-public-results]").getBoundingClientRect();
    return { fieldLeft: Math.round(f.left), fieldBottom: Math.round(f.bottom), left: Math.round(p.left), right: Math.round(p.right), top: Math.round(p.top), vw: innerWidth, results: el.querySelectorAll("[data-public-result]").length, thumbs: el.querySelectorAll("[data-public-thumb]").length, label: el.querySelector("[data-view-all]")?.innerText.trim() }; });
  check(`desktop ${w}: dropdown hangs from the field's left edge, fully inside the viewport`, dd.left === dd.fieldLeft && dd.left >= 0 && dd.right <= dd.vw && dd.top >= dd.fieldBottom && dd.results >= 1 && dd.thumbs === dd.results && (await noHScroll(page)), JSON.stringify(dd));
  check(`desktop ${w}: dropdown action reads "VIEW ALL COMPOUNDS & PRICES →" (no count)`, dd.label === "VIEW ALL COMPOUNDS & PRICES →", dd.label);
  if (w === 1366) await sleep(400); await page.screenshot({ path: path.join(shots, "A-dropdown-desktop-1366.png") });
  // Selecting goes to /register (not on /register).
  await Promise.all([page.waitForNavigation({ waitUntil: "networkidle0" }), page.evaluate(() => [...document.querySelectorAll("[data-public-result] [data-public-name]")].find((a) => a.offsetParent !== null).click())]);
  check(`desktop ${w}: choosing a compound goes to /register`, new URL(page.url()).pathname === "/register");
  // VERIFY BEFORE YOU BUY still opens its panel.
  await page.goto(`${BASE}/about`, { waitUntil: "networkidle0" });
  await page.evaluate(() => [...document.querySelectorAll("header nav button[aria-controls]")].find((b) => b.offsetParent !== null).click()); await sleep(500);
  const vpanel = await page.evaluate(() => { const b = [...document.querySelectorAll("header nav button[aria-controls]")].find((x) => x.offsetParent !== null); const p = document.getElementById(b.getAttribute("aria-controls")); return { expanded: b.getAttribute("aria-expanded"), panel: Boolean(p && p.offsetParent !== null) }; });
  check(`desktop ${w}: VERIFY BEFORE YOU BUY still opens its verification panel`, vpanel.expanded === "true" && vpanel.panel, JSON.stringify(vpanel));
  await ctx.close();
}

// ================= B. Tablet (768 / 1024 / 1279): layout unchanged =================
for (const w of [768, 1024, 1279]) {
  const { ctx, page } = await open(vp(w));
  await page.goto(`${BASE}/about`, { waitUntil: "networkidle0" });
  const t = await page.evaluate(() => { const header = document.querySelector("header"); const top = header.firstElementChild.getBoundingClientRect();
    const el = [...document.querySelectorAll("[data-public-search]")].find((e) => e.offsetParent !== null); const r = el?.getBoundingClientRect();
    const verifyVisible = [...header.querySelectorAll("button[aria-controls]")].filter((b) => b.offsetParent !== null).length;
    return { header: Math.round(header.getBoundingClientRect().height), searchInTopRow: Boolean(r && r.top >= top.top && r.bottom <= top.bottom), searchRight: r ? Math.round(innerWidth - r.right) : null, verifyVisible }; });
  check(`tablet ${w}: unchanged layout — search in the top row on the right, VERIFY in its own row, header 146px`, t.searchInTopRow && t.verifyVisible === 1 && t.header === 146 && (await noHScroll(page)), JSON.stringify(t));
  const box = await visibleSearch(page); const input = await box.evaluateHandle((el) => el.querySelector("input")); await input.focus(); await input.type("glow"); await sleep(500);
  const dd = await page.evaluate(() => { const p = [...document.querySelectorAll("[data-public-results]")].find((e) => e.offsetParent !== null).getBoundingClientRect(); return { left: Math.round(p.left), right: Math.round(p.right), vw: innerWidth }; });
  check(`tablet ${w}: dropdown inside the viewport`, dd.left >= 0 && dd.right <= dd.vw && (await noHScroll(page)), JSON.stringify(dd));
  if (w === 1024) { await sleep(400); await page.screenshot({ path: path.join(shots, "B-tablet-1024.png") }); }
  await ctx.close();
}

// ================= C. Signed-out phone header =================
for (const w of [360, 390, 430]) {
  const { ctx, page } = await open(vp(w, 844));
  await page.goto(`${BASE}/about`, { waitUntil: "networkidle0" });
  await installContrast(page);
  const h = await page.evaluate(() => { const header = document.querySelector("header"); const rows = header.children; const top = rows[0].getBoundingClientRect();
    const el = [...document.querySelectorAll("[data-public-search]")].find((e) => e.offsetParent !== null); const r = el?.getBoundingClientRect();
    const verifyVisible = [...header.querySelectorAll("button[aria-controls]")].filter((b) => b.offsetParent !== null).length;
    return { header: Math.round(header.getBoundingClientRect().height), searchVisible: Boolean(el), searchBelowTopRow: Boolean(r && r.top >= top.bottom - 1), searchInside: Boolean(r && r.left >= 0 && r.right <= innerWidth), verifyVisible }; });
  check(`phone ${w}: search permanently visible in the second row, VERIFY not in the rows, header height unchanged (133px)`, h.searchVisible && h.searchBelowTopRow && h.searchInside && h.verifyVisible === 0 && h.header === 133 && (await noHScroll(page)), JSON.stringify(h));
  const first = await placeholderText(page);
  const fit = await page.evaluate(() => { const el = [...document.querySelectorAll("[data-public-search]")].find((e) => e.offsetParent !== null); const s = el.querySelector("[data-placeholder]"); const cs = getComputedStyle(s);
    const x = document.createElement("span"); x.textContent = "VIEW COMPOUNDS & PRICES"; Object.assign(x.style, { position: "absolute", visibility: "hidden", whiteSpace: "nowrap", font: cs.font, textTransform: cs.textTransform }); document.body.appendChild(x); const r = Math.ceil(x.getBoundingClientRect().width); x.remove(); return { room: s.clientWidth, text: r }; });
  check(`phone ${w}: full "VIEW COMPOUNDS & PRICES" first, fits (${fit.text}px in ${fit.room}px)`, first?.t === "VIEW COMPOUNDS & PRICES" && fit.text <= fit.room, first?.t);
  if (w === 390) { await page.screenshot({ path: path.join(shots, "C-phone-390-header.png"), clip: { x: 0, y: 0, width: w, height: 260 } }); }
  // Hamburger: VERIFY first, no search inside, no duplicates; tapping VERIFY closes the menu and opens its panel.
  await page.click('button[aria-label="Toggle menu"]'); await sleep(500);
  const menu = await page.evaluate(() => { const header = document.querySelector("header"); const v = header.querySelector("[data-menu-verify]"); const menuEl = v?.parentElement;
    const firstChild = menuEl ? [...menuEl.children].find((c) => c.offsetParent !== null) : null;
    return { verifyFirst: Boolean(v && firstChild === v && v.offsetParent !== null), searchInMenu: menuEl ? menuEl.querySelectorAll("[data-public-search]").length : -1,
      verifyButtonsVisible: [...header.querySelectorAll("button[aria-controls]")].filter((b) => b.offsetParent !== null).length, searchesVisible: [...document.querySelectorAll("[data-public-search]")].filter((e) => e.offsetParent !== null).length,
      emblem: Boolean(v?.querySelector('img[src*="Emblem"]')) }; });
  check(`phone ${w}: menu opens with VERIFY BEFORE YOU BUY first (emblem kept), no search inside, nothing duplicated`, menu.verifyFirst && menu.searchInMenu === 0 && menu.verifyButtonsVisible === 1 && menu.searchesVisible === 1 && menu.emblem, JSON.stringify(menu));
  if (w === 390) await page.screenshot({ path: path.join(shots, "C-phone-390-menu.png"), clip: { x: 0, y: 0, width: w, height: 560 } });
  await page.evaluate(() => document.querySelector("[data-menu-verify] button").click()); await sleep(600);
  const after = await page.evaluate(() => { const b = document.querySelector("[data-menu-verify] button"); const panelId = document.querySelector("button[aria-controls]")?.getAttribute("aria-controls"); const p = panelId ? document.getElementById(panelId) : null;
    return { menuClosed: !b, panel: Boolean(p && p.offsetParent !== null) }; });
  check(`phone ${w}: VERIFY from the menu closes the menu and opens the verification panel (public, no sign-in)`, after.menuClosed && after.panel, JSON.stringify(after));
  if (w === 390) await page.screenshot({ path: path.join(shots, "C-phone-390-verify-panel.png"), clip: { x: 0, y: 0, width: w, height: 700 } });
  // Search from the row: dropdown inside the viewport, clear control, and with the keyboard "open" (emulated by a
  // shorter viewport) the first results stay reachable.
  await page.goto(`${BASE}/about`, { waitUntil: "networkidle0" });
  await installContrast(page);
  const box = await visibleSearch(page); const input = await box.evaluateHandle((el) => el.querySelector("input"));
  await input.focus(); await input.type("ghk"); await sleep(500);
  const dd = await page.evaluate(() => { const el = [...document.querySelectorAll("[data-public-search]")].find((e) => e.offsetParent !== null); const p = el.querySelector("[data-public-results]").getBoundingClientRect();
    const name = el.querySelector("[data-public-name]"); return { left: Math.round(p.left), right: Math.round(p.right), vw: innerWidth, name: name?.innerText, nameColor: name ? window.__contrast(name).fg : null, price: el.querySelector("[data-public-price]") ? window.__rgb(getComputedStyle(el.querySelector("[data-public-price]")).color) : null, thumbs: el.querySelectorAll("[data-public-thumb]").length }; });
  check(`phone ${w}: dropdown opens under the row search, inside the viewport; gray name, gold price, thumbnail`, dd.left >= 0 && dd.right <= dd.vw && dd.name === "GHK-Cu" && dd.price === "#c9a227" && dd.thumbs >= 1 && (await noHScroll(page)), JSON.stringify(dd));
  if (w === 390) { await sleep(400); await page.screenshot({ path: path.join(shots, "C-phone-390-dropdown.png") }); }
  await page.setViewport(vp(w, 420)); await sleep(300);
  const kb = await page.evaluate(() => { const el = [...document.querySelectorAll("[data-public-search]")].find((e) => e.offsetParent !== null); const r = el.querySelector("[data-public-result]")?.getBoundingClientRect(); const i = el.querySelector("input").getBoundingClientRect(); return { firstResultBottom: r ? Math.round(r.bottom) : null, inputBottom: Math.round(i.bottom), vh: innerHeight }; });
  check(`phone ${w}: with the keyboard open (emulated 420px viewport) the field and first result stay visible`, kb.firstResultBottom !== null && kb.firstResultBottom <= kb.vh && kb.inputBottom <= kb.vh, JSON.stringify(kb));
  await page.setViewport(vp(w, 844));
  await page.evaluate(() => [...document.querySelectorAll("[data-public-clear]")].find((b) => b.offsetParent !== null).click()); await sleep(200);
  check(`phone ${w}: the clear control empties the field`, (await (await visibleSearch(page)).evaluate((el) => el.querySelector("input").value)) === "");
  await ctx.close();
}

// ================= D. Registration page invitation =================
for (const [label, viewport] of [["desktop", vp(1366)], ["phone", vp(390, 844)]]) {
  const { ctx, page } = await open(viewport);
  await page.goto(`${BASE}/register`, { waitUntil: "networkidle0" });
  await installContrast(page);
  const d = await page.evaluate(() => {
    const inv = document.querySelector("[data-explore-invitation]"); const intro = [...document.querySelectorAll("section p")].find((p) => p.innerText.startsWith("Create an account to access"));
    const benefits = document.querySelector("section ul"); const btn = inv.querySelector("[data-explore-button]"); const cs = getComputedStyle(btn); const icon = btn.querySelector("svg");
    const form = document.querySelector("form"); const create = [...form.querySelectorAll("button")].find((b) => b.type === "submit");
    return { heading: inv.querySelector("h2").innerText, text: inv.querySelector("p").innerText, button: btn.innerText.replace(/\s+/g, " ").trim(), type: btn.getAttribute("type"),
      order: Boolean(intro && (intro.compareDocumentPosition(inv) & Node.DOCUMENT_POSITION_FOLLOWING) && (inv.compareDocumentPosition(benefits) & Node.DOCUMENT_POSITION_FOLLOWING)),
      aboveForm: inv.getBoundingClientRect().bottom <= form.getBoundingClientRect().top || innerWidth >= 1024,
      border: window.__rgb(cs.borderTopColor), borderW: cs.borderTopWidth, color: window.__rgb(cs.color), bg: cs.backgroundColor, iconColor: window.__rgb(getComputedStyle(icon).color),
      headingColor: window.__rgb(getComputedStyle(inv.querySelector("h2")).color), textC: window.__contrast(inv.querySelector("p")), btnC: window.__contrast(btn),
      createBg: window.__rgb(getComputedStyle(create).backgroundColor), card: Boolean(inv.closest("[class*='bg-']") && inv.closest("[class*='bg-']") !== document.body && inv.closest("section").contains(inv.closest("[class*='bg-']"))) };
  });
  check(`register ${label}: heading, text and button exactly as specified`, d.heading === "Explore before you register" && d.text === "Discover our compounds, strengths and pricing. No account required." && d.button === "VIEW COMPOUNDS & PRICES →", `${d.heading} | ${d.text} | ${d.button}`);
  check(`register ${label}: placed after the intro paragraph and before the account benefits${label === "phone" ? ", above the form" : ""}`, d.order && d.aboveForm);
  check(`register ${label}: thin navy outline, navy lettering, no fill, gold-ink icon, navy heading; type="button"`, d.border === "#132544" && d.borderW === "1px" && d.color === "#132544" && d.bg === "rgba(0, 0, 0, 0)" && d.iconColor === "#82673b" && d.headingColor === "#132544" && d.type === "button", JSON.stringify({ border: d.border, color: d.color, bg: d.bg, icon: d.iconColor, type: d.type }));
  check(`register ${label}: no card / banner / coloured background around it; CREATE ACCOUNT stays the gold-filled primary action`, !d.card && d.createBg === "#c9a227", d.createBg);
  if (label === "desktop") { M.push(`register invitation text (--muted): ${d.textC.fg} on ${d.textC.bg} → ${d.textC.ratio}:1`); M.push(`register invitation button (navy on page): ${d.btnC.fg} on ${d.btnC.bg} → ${d.btnC.ratio}:1`); }
  check(`register ${label}: invitation text and button ≥ 4.5:1`, d.textC.ratio >= 4.5 && d.btnC.ratio >= 4.5, `${d.textC.ratio} / ${d.btnC.ratio}`);
  await page.evaluate(() => document.querySelector("[data-explore-invitation]").scrollIntoView({ block: "center" }));
  await page.screenshot({ path: path.join(shots, `D-register-${label}.png`), fullPage: false });
  const url0 = page.url(); let navs = 0; page.on("framenavigated", (f) => { if (f === page.mainFrame()) navs++; });
  await page.click("[data-explore-button]"); await page.waitForSelector("[data-compound-list]", { visible: true });
  check(`register ${label}: the button opens the shared overlay directly (no navigation, same URL)`, navs === 0 && page.url() === url0 && (await page.$$("[data-compound-list]")).length === 1);
  await page.keyboard.press("Escape"); await sleep(300);
  await ctx.close();
}

// ================= E. MANDATORY registration form-state preservation =================
const SYN = { first: "Testfirst", last: "Testlast", email: `pkg3.synthetic.${Date.now()}@example.invalid`, phone: "123", password: "Synthetic-Pass-9x!", category: null };
for (const [label, viewport] of [["desktop", vp(1366)], ["phone", vp(390, 844)]]) {
  const { ctx, page } = await open(viewport);
  await page.goto(`${BASE}/register`, { waitUntil: "networkidle0" });
  const email = label + "." + SYN.email;
  // Fill every field with synthetic data.
  await page.type("#register-first-name", SYN.first); await page.type("#register-last-name", SYN.last); await page.type("#register-email", email);
  const cat = await page.evaluate(() => [...document.querySelectorAll("#register-research-category option")].map((o) => o.value).filter(Boolean)[1]);
  await page.select("#register-research-category", cat);
  await page.type("#register-phone", SYN.phone);
  await page.type("#register-password", SYN.password); await page.type("#register-password-confirm", SYN.password);
  await page.click("#register-marketing"); await page.click("#register-acknowledgment");
  // A validation state: submit with an invalid phone (checked in the browser; no request is sent).
  await page.evaluate(() => [...document.querySelectorAll("form button")].find((b) => b.type === "submit").click()); await sleep(300);
  const snapshot = () => page.evaluate(() => {
    const form = document.querySelector("form");
    return { marker: form.__pkg3marker ?? null, controls: [...form.querySelectorAll("input, select, textarea")].map((el) => `${el.id || el.name}=${el.type === "checkbox" ? el.checked : el.value}`).join("|"),
      error: form.querySelector('[role="alert"]')?.innerText ?? null };
  });
  await page.evaluate(() => { document.querySelector("form").__pkg3marker = Math.random().toString(36).slice(2); window.__submits = 0; document.addEventListener("submit", () => { window.__submits++; }, true); });
  const base = await snapshot();
  check(`state ${label}: starting state captured (all fields filled, a validation error shown)`, base.error?.includes("valid phone number") && base.controls.includes(`register-first-name=${SYN.first}`) && base.controls.includes("register-acknowledgment=true"), `${base.controls.split("|").length} controls`);
  const requests = []; page.on("request", (r) => requests.push({ url: r.url(), body: r.postData() ?? "" }));
  let navs = 0; page.on("framenavigated", (f) => { if (f === page.mainFrame()) navs++; });
  const hist0 = await page.evaluate(() => history.length);
  const openOverlay = async () => { await page.click("[data-explore-button]"); await page.waitForSelector("[data-compound-list]", { visible: true }); await sleep(150); };
  const same = async (step, { focus } = {}) => {
    await sleep(400);
    const now = await snapshot();
    const extra = await page.evaluate(() => ({ submits: window.__submits, focused: document.activeElement?.hasAttribute("data-explore-button") ? "invitation" : document.activeElement?.id || document.activeElement?.tagName, overlay: Boolean(document.querySelector("[data-compound-list]")), scrollY: Math.round(scrollY) }));
    const focusOk = focus === "invitation" ? extra.focused === "invitation" : focus === "heading" ? extra.focused === "register-form-heading" : true;
    check(`state ${label}: after ${step} — every value, checkbox, the validation message and the same form element (no remount); no submit${focus ? `; focus on the ${focus}` : ""}`,
      now.marker === base.marker && now.controls === base.controls && now.error === base.error && extra.submits === 0 && !extra.overlay && focusOk, `${extra.focused} · submits ${extra.submits}`);
    return extra;
  };
  // Scroll position: dismissals restore it.
  const y0 = await page.evaluate(() => { document.querySelector("[data-explore-button]").scrollIntoView({ block: "center" }); return Math.round(scrollY); });
  await openOverlay(); await page.click("[data-close-list]");
  const e1 = await same("opening and closing with ×", { focus: "invitation" });
  check(`state ${label}: page position restored after ×`, Math.abs(e1.scrollY - y0) <= 1, `${y0} → ${e1.scrollY}`);
  await openOverlay(); await page.keyboard.press("Escape"); await same("Escape", { focus: "invitation" });
  await openOverlay(); await page.mouse.click(5, 5); await same("clicking the backdrop", { focus: "invitation" });
  // Searching, Enter in the search field, clearing, scrolling, then closing.
  await openOverlay(); await page.type("[data-list-search-input]", "bpc"); await page.keyboard.press("Enter"); await sleep(200);
  await page.click("[data-list-search-clear]"); await page.evaluate(() => { const l = document.querySelector("[data-compound-rows]"); l.scrollTop = l.scrollHeight; }); await sleep(200);
  await page.type("[data-list-search-input]", "zzzz"); await sleep(200); await page.keyboard.press("Escape");
  await same("searching, pressing Enter, clearing, scrolling the list and a no-results search", { focus: "invitation" });
  // Registration actions while on /register: close and return to the form, no navigation.
  await openOverlay(); await page.click('[data-compound-row] [data-list-name]'); await same("selecting a compound", { focus: "heading" });
  await openOverlay(); await page.click('[data-compound-row] [data-list-strength]'); await same("selecting a strength", { focus: "heading" });
  await openOverlay(); await page.click("[data-list-cta]"); await same("CREATE YOUR FREE ACCOUNT", { focus: "heading" });
  // Repeated opening and closing.
  for (let i = 0; i < 3; i++) { await openOverlay(); await page.type("[data-list-search-input]", "kpv"); await page.click("[data-close-list]"); }
  await same("three more open / search / close cycles", { focus: "invitation" });
  const hist1 = await page.evaluate(() => history.length);
  check(`state ${label}: no navigation and no history entries during all overlay use`, navs === 0 && hist1 === hist0, `navigations ${navs}, history ${hist0} → ${hist1}`);
  // Nothing sensitive leaves the page or reaches storage.
  const store = await page.evaluate(() => JSON.stringify({ ls: { ...localStorage }, ss: { ...sessionStorage }, cookie: document.cookie }));
  const leaks = [SYN.password, email, SYN.first, SYN.last].filter((v) => store.includes(v) || requests.some((r) => r.url.includes(v) || r.body.includes(v)) || page.url().includes(v));
  check(`state ${label}: no name, email or password in localStorage, sessionStorage, cookies, the URL or any request during overlay use`, leaks.length === 0 && !requests.some((r) => /\/api\/auth\/register/.test(r.url)), `${requests.length} requests checked`);
  await page.evaluate(() => document.querySelector("form").scrollIntoView({ block: "start" }));
  await page.screenshot({ path: path.join(shots, `E-state-preserved-${label}.png`), fullPage: false });
  // Then complete registration normally (local test data).
  await page.$eval("#register-phone", (el) => el.select()); await page.keyboard.press("Backspace"); await page.type("#register-phone", "(555) 234-5678"); // the site rule needs the exchange to start 2–9
  await Promise.all([page.waitForNavigation({ waitUntil: "networkidle0", timeout: 30000 }).catch(() => null), page.evaluate(() => [...document.querySelectorAll("form button")].find((b) => b.type === "submit").click())]);
  const created = (await q("SELECT email FROM users WHERE email = $1", [email.toLowerCase()]).catch(() => []))[0];
  check(`state ${label}: registration then completes normally with the same entries (account created locally)`, Boolean(created) && new URL(page.url()).pathname !== "/register", `${created ? "user row present" : "no user row"} · now at ${new URL(page.url()).pathname}`);
  await ctx.close();
}

// ================= F. Shared overlay search =================
const hiddenSlugs = (await q("SELECT slug FROM products WHERE NOT active")).map((r) => r.slug);
for (const [label, viewport, entry] of [["desktop header", vp(1366), "header"], ["phone header", vp(390, 844), "header"], ["desktop register", vp(1366), "register"], ["phone register", vp(390, 844), "register"]]) {
  const { ctx, page } = await open(viewport);
  await page.goto(`${BASE}/${entry === "register" ? "register" : "about"}`, { waitUntil: "networkidle0" });
  await installContrast(page);
  if (entry === "header") { const box = await visibleSearch(page); await (await box.evaluateHandle((el) => el.querySelector("input"))).focus(); await sleep(300); await page.evaluate(() => [...document.querySelectorAll("[data-view-all]")].find((b) => b.offsetParent !== null).click()); }
  else await page.click("[data-explore-button]");
  await page.waitForSelector("[data-compound-list]", { visible: true });
  const rows = () => page.evaluate(() => [...document.querySelectorAll("[data-compound-row]")].map((r) => r.dataset.compoundRow));
  const o = await page.evaluate(() => { const dlg = document.querySelector("[data-compound-list] [role=dialog]"); return { title: dlg.querySelector("#compound-list-title").innerText, overlays: document.querySelectorAll("[data-compound-list]").length,
    imgs: dlg.querySelectorAll("img").length, placeholder: dlg.querySelector("[data-list-search-input]").placeholder, label: dlg.querySelector('label[for="compound-list-search"]')?.innerText,
    focused: document.activeElement?.hasAttribute("data-close-list"), bodyLock: document.body.style.overflow, text: dlg.innerText }; });
  const all = await rows();
  check(`overlay (${label}): one overlay, heading "VIEW ALL COMPOUNDS & PRICES" (no count), full catalog of ${COUNT} alphabetically, no thumbnails`,
    o.overlays === 1 && o.title === "VIEW ALL COMPOUNDS & PRICES" && JSON.stringify(all) === JSON.stringify(pub.compounds.map((c) => c.slug)) && o.imgs === 0 && !new RegExp(`\\b${COUNT}\\b`).test(o.title), o.title);
  check(`overlay (${label}): search field labelled, placeholder "Search compounds...", focus on close (no keyboard raised), page scroll locked`, o.placeholder === "Search compounds..." && Boolean(o.label) && o.focused && o.bodyLock === "hidden");
  check(`overlay (${label}): no hidden product, deactivated strength, BAC Water, stock or SKU shown`, !all.some((s) => hiddenSlugs.includes(s)) && !all.includes("bac-water") && !/in stock|out of stock|units|SKU/i.test(o.text));
  const search = async (text) => { await page.$eval("[data-list-search-input]", (el) => { el.focus(); el.select(); }); await page.keyboard.press("Backspace"); if (text) await page.type("[data-list-search-input]", text); await sleep(250); return rows(); };
  const cas = pub.compounds.find((c) => /\d{2,7}-\d{2}-\d/.test(c.casNumber ?? ""));
  const casNo = cas.casNumber.match(/\d{2,7}-\d{2}-\d/)[0];
  const full = await search("BPC-157"), partial = await search("glo"), alias = await search("no dac"), byCas = await search(casNo);
  check(`overlay (${label}): full name, partial name, alternate name and CAS all match`, full.includes("bpc-157") && partial.includes("glow-blend") && alias.includes("cjc-1295-ipamorelin-blend") && byCas.includes(cas.slug), `${full.join(",")} | ${partial.join(",")} | ${alias.join(",")} | ${byCas.join(",")}`);
  const many = await search("e");
  check(`overlay (${label}): filters the COMPLETE catalog — "e" matches ${many.length} (more than the autocomplete's 8), still alphabetical`, many.length > 8 && JSON.stringify(many) === JSON.stringify(pub.compounds.map((c) => c.slug).filter((s) => many.includes(s))), `${many.length}`);
  const prices = await page.evaluate(() => [...document.querySelectorAll("[data-compound-row]")].map((r) => [r.dataset.compoundRow, [...r.querySelectorAll("[data-list-strength]")].map((s) => s.innerText.replace(/\s+/g, " ").trim()).join(",")]));
  check(`overlay (${label}): every matched row has its strengths and prices exactly as the catalog`, prices.every(([slug, txt]) => txt === pub.compounds.find((c) => c.slug === slug).strengths.map((s) => `${s.label} $${s.price.regularUsd.toFixed(2)}`).join(",")));
  await search("bpc"); if (label === "desktop register" || label === "phone header") await page.screenshot({ path: path.join(shots, `F-overlay-filtered-${label.replace(" ", "-")}.png`) });
  const none = await search("zzzz");
  const empty = await page.evaluate(() => ({ msg: document.querySelector("[data-list-empty]")?.innerText, role: document.querySelector("[data-list-empty]")?.getAttribute("role"), input: Boolean(document.querySelector("[data-list-search-input]")?.offsetParent), clear: Boolean(document.querySelector("[data-list-search-clear]")?.offsetParent) }));
  check(`overlay (${label}): no results → "No matching compounds found." (announced), search and clear still there`, none.length === 0 && empty.msg === "No matching compounds found." && empty.role === "status" && empty.input && empty.clear, JSON.stringify(empty));
  if (label === "desktop register" || label === "phone header") await page.screenshot({ path: path.join(shots, `F-overlay-no-results-${label.replace(" ", "-")}.png`) });
  await page.click("[data-list-search-clear]"); await sleep(250);
  check(`overlay (${label}): clearing restores the full catalog`, JSON.stringify(await rows()) === JSON.stringify(all));
  if (label === "desktop register" || label === "phone header") await page.screenshot({ path: path.join(shots, `F-overlay-cleared-${label.replace(" ", "-")}.png`) });
  // Scrolling: header, search and CTA stay put while the list scrolls.
  await page.evaluate(() => { const l = document.querySelector("[data-compound-rows]"); l.scrollTop = l.scrollHeight; }); await sleep(200);
  const sc = await page.evaluate(() => { const g = (s) => document.querySelector(s).getBoundingClientRect(); const l = document.querySelector("[data-compound-rows]"); return { scrolled: l.scrollTop > 0, header: g("[data-list-header]").top >= 0, search: g("[data-list-search]").bottom <= innerHeight, cta: g("[data-list-cta]").bottom <= innerHeight, overflow: document.documentElement.scrollWidth > innerWidth + 1 }; });
  check(`overlay (${label}): the list scrolls on its own; header, search and CREATE YOUR FREE ACCOUNT stay on screen; no horizontal scroll`, sc.scrolled && sc.header && sc.search && sc.cta && !sc.overflow, JSON.stringify(sc));
  // Keyboard: Tab stays in the dialog; contrast of the new search field.
  for (let i = 0; i < 70; i++) await page.keyboard.press("Tab");
  const inDialog = await page.evaluate(() => Boolean(document.activeElement?.closest("[role=dialog]")));
  const fc = await page.evaluate(() => { const i = document.querySelector("[data-list-search-input]"); return { box: window.__rgb(getComputedStyle(i.parentElement).borderTopColor), icon: window.__rgb(getComputedStyle(i.parentElement.querySelector("svg")).color) }; });
  check(`overlay (${label}): Tab stays inside the dialog; thin hairline border, gold-ink icon`, inDialog && fc.box === "#e3e5e9" && fc.icon === "#82673b", JSON.stringify(fc));
  // Short viewport (phone keyboard emulation): search, close and CTA reachable, some rows visible.
  if (viewport.width < 768) {
    await page.setViewport(vp(viewport.width, 420)); await sleep(300);
    const kb = await page.evaluate(() => { const g = (s) => document.querySelector(s).getBoundingClientRect(); const rowsVisible = [...document.querySelectorAll("[data-compound-row]")].filter((r) => { const b = r.getBoundingClientRect(); const l = document.querySelector("[data-compound-rows]").getBoundingClientRect(); return b.top >= l.top && b.bottom <= l.bottom; }).length;
      return { close: g("[data-close-list]").top >= 0, input: g("[data-list-search-input]").bottom <= innerHeight, cta: g("[data-list-cta]").bottom <= innerHeight, rowsVisible }; });
    check(`overlay (${label}): with the keyboard open (emulated 420px viewport) close, search and CTA stay reachable and rows remain browsable`, kb.close && kb.input && kb.cta && kb.rowsVisible >= 2, JSON.stringify(kb));
    await page.screenshot({ path: path.join(shots, `F-overlay-keyboard-emulated-${label.replace(" ", "-")}.png`) });
    await page.setViewport(vp(viewport.width, 844)); await sleep(200);
  }
  if (label === "desktop header") await page.screenshot({ path: path.join(shots, "F-overlay-full-desktop.png") });
  // Close and reopen: the search starts empty again; body scroll restored on close.
  await page.type("[data-list-search-input]", "kpv"); await page.keyboard.press("Escape"); await sleep(250);
  const unlocked = await page.evaluate(() => document.body.style.overflow);
  if (entry === "header") { const box = await visibleSearch(page); await (await box.evaluateHandle((el) => el.querySelector("input"))).focus(); await sleep(300); await page.evaluate(() => [...document.querySelectorAll("[data-view-all]")].find((b) => b.offsetParent !== null).click()); }
  else await page.click("[data-explore-button]");
  await page.waitForSelector("[data-compound-list]", { visible: true });
  const re = await page.evaluate(() => ({ value: document.querySelector("[data-list-search-input]").value, rows: document.querySelectorAll("[data-compound-row]").length }));
  check(`overlay (${label}): page scroll restored on close; reopening starts with an empty search and the full catalog`, unlocked !== "hidden" && re.value === "" && re.rows === COUNT, JSON.stringify({ unlocked, ...re }));
  if (entry === "header") { await Promise.all([page.waitForNavigation({ waitUntil: "networkidle0" }), page.click("[data-list-cta]")]); check(`overlay (${label}): from a non-registration page, CREATE YOUR FREE ACCOUNT still goes to /register`, new URL(page.url()).pathname === "/register"); }
  await ctx.close();
}

// ================= G. Coming Soon =================
const kpv = (await q("SELECT id, availability_status, estimated_available_on FROM product_strengths WHERE sku = 'KPV-10MG'"))[0];
try {
  for (const [label, viewport] of [["desktop", vp(1366)], ["phone", vp(390, 844)]]) {
    for (const date of ["2026-12-15", null]) {
      await q("UPDATE product_strengths SET availability_status = 'coming_soon', estimated_available_on = $2 WHERE id = $1", [kpv.id, date]);
      const { ctx, page } = await open(viewport, `demo-customer~s~${Date.now()}`);
      await page.goto(`${BASE}/shop/kpv`, { waitUntil: "networkidle0" });
      await installContrast(page);
      const b = await page.evaluate(() => { const el = document.querySelector("[data-status-badge]"); const cs = getComputedStyle(el); const wrap = el.closest("[data-coming-soon]"); const panel = el.closest("[data-selected-strength]");
        const btn = [...document.querySelectorAll("button")].find((x) => /coming soon/i.test(x.innerText) && x.disabled);
        return { borders: [cs.borderTopWidth, cs.borderRightWidth, cs.borderBottomWidth, cs.borderLeftWidth].join(","), bg: cs.backgroundColor, pad: [cs.paddingTop, cs.paddingRight, cs.paddingBottom, cs.paddingLeft].join(","), radius: cs.borderTopLeftRadius,
          color: window.__rgb(cs.color), c: window.__contrast(el), panelBg: window.__rgb(getComputedStyle(panel).backgroundColor), dot: el.querySelector("span.rounded-full") ? window.__rgb(getComputedStyle(el.querySelector("span.rounded-full")).backgroundColor) : null, text: el.innerText.trim(),
          date: [...wrap.querySelectorAll("p")].map((p) => p.innerText).find((t) => /Estimated availability/.test(t)) ?? null, emptyLabel: /Estimated availability:\s*$/.test(wrap.innerText),
          button: btn ? { text: btn.innerText.trim(), disabled: btn.disabled, cls: btn.className } : null };
      });
      const tag = `${label}, ${date ? "with" : "without"} a date`;
      check(`Coming Soon (${tag}): no border, no tinted background, no padding/shape — straight on the panel`, b.borders === "0px,0px,0px,0px" && b.bg === "rgba(0, 0, 0, 0)" && b.pad === "0px,0px,0px,0px" && b.radius === "0px", `${b.bg} · ${b.pad}`);
      check(`Coming Soon (${tag}): gold dot and gold-ink "Coming Soon" kept`, b.dot === "#c9a227" && b.color === "#82673b" && b.text === "Coming Soon");
      check(`Coming Soon (${tag}): text ≥ 4.5:1 on the actual panel (${b.panelBg})`, b.c.ratio >= 4.5 && b.c.bg === b.panelBg, `${b.c.fg} on ${b.c.bg} → ${b.c.ratio}:1`);
      check(`Coming Soon (${tag}): ${date ? "date on its own line" : "no date and no empty label"}`, date ? b.date === "Estimated availability: December 15, 2026" : b.date === null && !b.emptyLabel, b.date ?? "none");
      check(`Coming Soon (${tag}): larger COMING SOON button unchanged and disabled`, b.button?.text.toUpperCase() === "COMING SOON" && b.button.disabled, JSON.stringify(b.button && { text: b.button.text, disabled: b.button.disabled }));
      if (label === "desktop" && date) M.push(`Coming Soon text (--gold-ink, no tint): ${b.c.fg} on ${b.c.bg} (purchase panel) → ${b.c.ratio}:1`);
      await page.evaluate(() => document.querySelector("[data-status-badge]").scrollIntoView({ block: "center" }));
      await page.screenshot({ path: path.join(shots, `G-coming-soon-${label}-${date ? "with-date" : "no-date"}.png`) });
      await ctx.close();
    }
  }
  // Other statuses unchanged: an in-stock strength shows no Coming Soon indicator.
  await q("UPDATE product_strengths SET availability_status = $2, estimated_available_on = $3 WHERE id = $1", [kpv.id, kpv.availability_status, kpv.estimated_available_on]);
  const { ctx, page } = await open(vp(1366), `demo-customer~s~${Date.now()}`);
  await page.goto(`${BASE}/shop/kpv`, { waitUntil: "networkidle0" });
  check("other availability states unchanged (KPV back to its own status shows no Coming Soon indicator)", kpv.availability_status === "coming_soon" || !(await page.$("[data-status-badge]")), kpv.availability_status);
  await ctx.close();
} finally {
  await q("UPDATE product_strengths SET availability_status = $2, estimated_available_on = $3 WHERE id = $1", [kpv.id, kpv.availability_status, kpv.estimated_available_on]);
}

// ================= H. Responsive sweep =================
for (const w of [360, 390, 430, 768, 1024, 1279, 1280, 1366, 1440]) {
  for (const signedIn of [false, true]) {
    const { ctx, page } = await open(vp(w, 860), signedIn ? `demo-customer~s~${Date.now()}` : null);
    const res = {};
    for (const p of ["/", "/register", "/about"]) {
      if (signedIn && p === "/register") continue;
      await page.goto(`${BASE}${p}`, { waitUntil: "load" }); await sleep(800);
      res[p] = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth > innerWidth + 1, header: Math.round(document.querySelector("header").getBoundingClientRect().height) }));
    }
    const ok = Object.values(res).every((r) => !r.overflow);
    check(`responsive ${w}px ${signedIn ? "signed in" : "signed out"}: no horizontal scroll on ${Object.keys(res).join(", ")}`, ok, `header ${Object.values(res)[0].header}px`);
    await ctx.close();
  }
}

await browser.close().catch(() => {}); edge.kill(); await pool.end();
console.log("\nMEASUREMENTS\n" + M.map((l) => `  ${l}`).join("\n"));
console.log(`\n[V3] ${pass} passed, ${fail} failed (${pass + fail} checks)${failures.length ? `\nFAILED: ${failures.join(" | ")}` : ""}`);
process.exit(fail ? 1 : 0);
