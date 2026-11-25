// LOCAL ONLY. Website Refinements Package 1 — browser tests (headless Edge via puppeteer-core) against
// http://localhost:3300 (SNAP=ref1 bash cycle.sh) and the local test DB.
//  1. Signed-out header search, desktop and phone: rotating placeholder with the dynamic count (fade, stops on focus
//     and typing), autocomplete by name / alternate name / CAS with photo + strengths + prices, View All list,
//     registration routing, field size equal to the signed-in box, no horizontal scroll.
//  2. Signed-in header search unchanged.
//  3. Blend Composition section on the product page (desktop and phone); Wolverine renders none.
//  4. Executive Office → Blends: list, flagged blend, edit with live validation, reorder, save.
// Screenshots go to scratch shots-r1/ for the report.
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import pg from "pg";
import puppeteer from "puppeteer-core";

const BASE = "http://localhost:3300";
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const here = path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Z]:)/, "$1");
const profile = path.join(here, "edge-profile-r1");
const shots = path.join(here, "shots-r1");
fs.rmSync(profile, { recursive: true, force: true });
fs.mkdirSync(shots, { recursive: true });
const edge = spawn(EDGE, ["--headless=new", `--user-data-dir=${profile}`, "--remote-debugging-port=9335", "--no-first-run", "--disable-gpu", "about:blank"], { stdio: "ignore" });
const pool = new pg.Pool({ host: "127.0.0.1", port: 5491, user: "demo", password: "demo", database: "demo", max: 3 });
const q = async (t, p = []) => (await pool.query(t, p)).rows;
let pass = 0, fail = 0; const failures = [];
const check = (name, ok, detail = "") => { if (ok) pass++; else { fail++; failures.push(name); } console.log(`${ok ? "PASS" : "FAIL"}  [R1-UI] ${name}${detail ? `  — ${detail}` : ""}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const enc = new TextEncoder();
async function sign(v) {
  const d = await crypto.subtle.digest("SHA-256", enc.encode("demo-session-secret"));
  const k = await crypto.subtle.importKey("raw", d, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return Buffer.from(await crypto.subtle.sign("HMAC", k, enc.encode(v))).toString("hex");
}
async function token(payload) { const s = `${payload}.${Date.now() + 3600_000}`; return `${s}.${await sign(s)}`; }

let browser;
for (let i = 0; i < 40 && !browser; i++) { try { browser = await puppeteer.connect({ browserURL: "http://127.0.0.1:9335" }); } catch { await sleep(250); } }
if (!browser) throw new Error("Edge did not start");
async function open(viewport, userPayload = null) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport(viewport);
  const cookies = [{ name: "vericert_age_ack", value: "1", domain: "localhost", path: "/" }];
  if (userPayload) cookies.push({ name: "vericert_customer_session", value: await token(userPayload), domain: "localhost", path: "/" });
  await ctx.setCookie(...cookies);
  return { ctx, page };
}
// Replaces a field's whole value (a triple-click doesn't select the text of a type="search" input reliably).
const retype = async (input, text) => { await input.evaluate((el) => el.select()); await input.type(text); };
const noHScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const COUNT = (await (await fetch(`${BASE}/api/public-catalog`)).json()).count;
const pub = (await (await fetch(`${BASE}/api/public-catalog`)).json()).compounds;
const DESKTOP = { width: 1366, height: 860 };
const PHONE = { width: 390, height: 844, isMobile: true, hasTouch: true };

// ---------- 1. signed-out search ----------
for (const [label, viewport] of [["desktop", DESKTOP], ["phone", PHONE]]) {
  const { ctx, page } = await open(viewport);
  await page.goto(`${BASE}/`, { waitUntil: "networkidle0" });
  if (label === "phone") {
    await page.click('button[aria-label="Toggle menu"]');
    await page.waitForSelector("[data-public-search]", { visible: true, timeout: 5000 }).catch(() => {});
  }
  const visibleBox = await page.evaluateHandle(() => [...document.querySelectorAll("[data-public-search]")].find((el) => el.offsetParent !== null) ?? null);
  check(`${label}: the signed-out header shows the compound search`, await visibleBox.evaluate((el) => Boolean(el)));
  const ph = () => visibleBox.evaluate((el) => { const s = el.querySelector("[data-placeholder]"); return s ? { text: s.innerText, opacity: Number(getComputedStyle(s).opacity) } : null; });
  // Visual Package 2 phrases. Watch ~8 s: both appear and the switch fades. (Widths, colours, timing and contrast are
  // measured in t-visual2-ui.mjs.)
  const seen = new Set(); let minOpacity = 1;
  for (let i = 0; i < 80; i++) { const p = await ph(); if (p) { seen.add(p.text); minOpacity = Math.min(minOpacity, p.opacity); } await sleep(100); }
  // Full desktop width shows "COMPOUNDS & PRICES" (owner, 2026-11-23); the phone keeps the full phrase.
  const pricing = label === "phone" ? "VIEW COMPOUNDS & PRICES" : "COMPOUNDS & PRICES";
  check(`${label}: placeholder alternates "${pricing}" / "SEARCH COMPOUNDS" (no count in the placeholder)`, seen.has(pricing) && seen.has("SEARCH COMPOUNDS") && seen.size === 2, [...seen].join(" / "));
  check(`${label}: the switch is a fade (opacity dips below 1)`, minOpacity < 0.6, `min opacity ${minOpacity.toFixed(2)}`);
  const input = await visibleBox.evaluateHandle((el) => el.querySelector("input"));
  await input.focus();
  const atFocus = (await ph())?.text; const frozen = new Set();
  for (let i = 0; i < 40; i++) { frozen.add((await ph())?.text); await sleep(100); }
  check(`${label}: rotation stops on focus (same placeholder for 4 s)`, frozen.size === 1 && frozen.has(atFocus), [...frozen].join(" / "));
  const viewAll = await page.evaluate(() => { const panel = [...document.querySelectorAll("[data-public-results]")].find((p) => p.offsetParent !== null); return panel ? { results: panel.querySelectorAll("[data-public-result]").length, button: panel.querySelector("[data-view-all]")?.textContent } : null; });
  check(`${label}: on focus with an empty field: only "View All Compounds & Prices →" (Package 3: no count)`, viewAll?.results === 0 && viewAll.button === "View All Compounds & Prices →", JSON.stringify(viewAll));
  await input.type("bpc");
  await sleep(300);
  const r = await page.evaluate(() => [...document.querySelectorAll("[data-public-result]")].filter((e) => e.offsetParent !== null).map((e) => ({
    slug: e.dataset.publicResult, name: e.querySelector("[data-public-name]")?.textContent, img: Boolean(e.querySelector("img")),
    strengths: [...e.querySelectorAll("[data-public-strength]")].map((s) => s.textContent.replace(/\s+/g, " ").trim()) })));
  const bpcApi = pub.find((c) => c.slug === "bpc-157");
  const bpcRow = r.find((x) => x.slug === "bpc-157");
  check(`${label}: typing "bpc" finds BPC-157 with its strengths and prices exactly as the catalog`, Boolean(bpcRow) && JSON.stringify(bpcRow.strengths) === JSON.stringify(bpcApi.strengths.map((s) => `${s.label} · $${s.price.regularUsd.toFixed(2)}`)), JSON.stringify(bpcRow));
  check(`${label}: results show the existing product photo when there is one`, !bpcApi.imageUrl || bpcRow?.img, `imageUrl ${bpcApi.imageUrl ? "set" : "none"}`);
  check(`${label}: placeholder hidden while typing (no rotation)`, (await ph()) === null);
  await retype(input, "300801-03-0"); await sleep(300);
  const cas = await page.evaluate(() => [...document.querySelectorAll("[data-public-result]")].filter((e) => e.offsetParent !== null).map((e) => e.dataset.publicResult));
  check(`${label}: search by CAS number (300801-03-0 → GHK-Cu first)`, cas[0] === "ghk-cu", cas.join(","));
  await retype(input, "no dac"); await sleep(300);
  const alt = await page.evaluate(() => [...document.querySelectorAll("[data-public-result]")].filter((e) => e.offsetParent !== null).map((e) => e.dataset.publicResult));
  check(`${label}: search by alternate name ("no dac" → the CJC-1295 / Ipamorelin blend; the hidden CJC-1295 No DAC product never appears)`, alt.includes("cjc-1295-ipamorelin-blend") && !alt.includes("cjc-1295-no-dac"), alt.join(","));
  await retype(input, "tb-500"); await sleep(300);
  const tb500 = await page.evaluate(() => [...document.querySelectorAll("[data-public-result]")].filter((e) => e.offsetParent !== null).map((e) => e.dataset.publicResult));
  check(`${label}: hidden TB-500 isn't searchable signed out`, !tb500.includes("tb-500"), tb500.join(",") || "no results");
  await retype(input, "ghk"); await sleep(300);
  check(`${label}: no horizontal scroll with the results open`, await noHScroll(page));
  if (label === "desktop") await page.screenshot({ path: path.join(shots, "search-results-desktop.png") });
  await Promise.all([page.waitForNavigation({ waitUntil: "networkidle0" }), page.evaluate(() => [...document.querySelectorAll("[data-public-result] a")].find((a) => a.offsetParent !== null).click())]);
  check(`${label}: choosing a compound goes to /register`, new URL(page.url()).pathname === "/register", page.url());

  // strength chip → /register; View All list
  await page.goto(`${BASE}/`, { waitUntil: "networkidle0" });
  if (label === "phone") await page.click('button[aria-label="Toggle menu"]');
  const box2 = await page.evaluateHandle(() => [...document.querySelectorAll("[data-public-search]")].find((el) => el.offsetParent !== null));
  const input2 = await box2.evaluateHandle((el) => el.querySelector("input"));
  await input2.focus(); await input2.type("kpv"); await sleep(300);
  await Promise.all([page.waitForNavigation({ waitUntil: "networkidle0" }), page.evaluate(() => [...document.querySelectorAll("[data-public-strength]")].find((a) => a.offsetParent !== null).click())]);
  check(`${label}: choosing a strength goes to /register`, new URL(page.url()).pathname === "/register");
  await page.goto(`${BASE}/`, { waitUntil: "networkidle0" });
  if (label === "phone") await page.click('button[aria-label="Toggle menu"]');
  const box3 = await page.evaluateHandle(() => [...document.querySelectorAll("[data-public-search]")].find((el) => el.offsetParent !== null));
  await (await box3.evaluateHandle((el) => el.querySelector("input"))).focus();
  await sleep(200);
  await page.evaluate(() => [...document.querySelectorAll("[data-view-all]")].find((b) => b.offsetParent !== null).click());
  await page.waitForSelector("[data-compound-list]", { visible: true });
  const list = await page.evaluate(() => {
    const rows = [...document.querySelectorAll("[data-compound-row]")];
    const dlg = document.querySelector("[data-compound-list] [role=dialog]").getBoundingClientRect();
    return { title: document.querySelector("#compound-list-title").textContent, names: rows.map((r) => r.querySelector("a").textContent), firstRow: rows[0]?.textContent.replace(/\s+/g, " ").trim(),
      imgs: document.querySelectorAll("[data-compound-list] img").length, dlgLeft: dlg.left, dlgRight: dlg.right, dlgTop: dlg.top, dlgHeight: dlg.height,
      overlay: (() => { const o = document.querySelector("[data-compound-list]").getBoundingClientRect(); return { top: o.top, left: o.left, w: o.width, h: o.height }; })(),
      visibleRows: rows.filter((r) => { const b = r.getBoundingClientRect(); return b.top >= dlg.top && b.bottom <= dlg.bottom; }).length,
      focused: document.activeElement?.hasAttribute("data-close-list") };
  });
  check(`${label}: the list covers the whole screen (not confined to the header) and is tall enough to read`,
    list.overlay.top === 0 && list.overlay.left === 0 && Math.round(list.overlay.w) >= viewport.width - 20 && Math.round(list.overlay.h) === viewport.height
    && list.dlgHeight >= viewport.height * 0.6 && list.visibleRows >= 6, `overlay ${JSON.stringify(list.overlay)}, sheet ${Math.round(list.dlgHeight)}px, ${list.visibleRows} rows fully visible`);
  const sortedNames = pub.map((c) => c.name);
  check(`${label}: View All opens a compact alphabetical list of all ${COUNT} compounds (no product cards or images)`, list.title === "View All Compounds & Prices" && list.names.length === COUNT && JSON.stringify(list.names) === JSON.stringify(sortedNames) && list.imgs === 0, `${list.names.length} rows`);
  const first = pub[0];
  check(`${label}: each row shows the compound's strengths and prices`, list.firstRow === `${first.name}${first.strengths.map((s) => `${s.label} $${s.price.regularUsd.toFixed(2)}`).join("")}`.replace(/\s+/g, " ").trim(), list.firstRow);
  check(`${label}: the list fits the screen (no horizontal scroll), focus moves to its close button`, list.dlgLeft >= 0 && list.dlgRight <= viewport.width && (await noHScroll(page)) && list.focused, `${list.dlgLeft}–${list.dlgRight}`);
  await page.screenshot({ path: path.join(shots, `view-all-${label}.png`) });
  await page.keyboard.press("Escape"); await sleep(200);
  check(`${label}: Escape closes the list`, !(await page.$("[data-compound-list]")));
  await (await box3.evaluateHandle((el) => el.querySelector("input"))).focus(); await sleep(200);
  await page.evaluate(() => [...document.querySelectorAll("[data-view-all]")].find((b) => b.offsetParent !== null).click());
  await page.waitForSelector("[data-compound-row] a");
  await Promise.all([page.waitForNavigation({ waitUntil: "networkidle0" }), page.evaluate(() => document.querySelector("[data-compound-row] a").click())]);
  check(`${label}: choosing a compound in the list goes to /register`, new URL(page.url()).pathname === "/register");
  await ctx.close();
}

// ---------- 1b / 2. same field size as the signed-in box; signed-in search unchanged ----------
{
  const so = await open(DESKTOP);
  await so.page.goto(`${BASE}/about`, { waitUntil: "networkidle0" });
  const outBox = await so.page.evaluate(() => { const el = [...document.querySelectorAll("[data-public-search]")].find((e) => e.offsetParent !== null); const f = el.querySelector("div.border"); const i = el.querySelector("input"); const r = f.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), font: getComputedStyle(i).fontSize, header: Math.round(document.querySelector("header").getBoundingClientRect().height) }; });
  await so.page.screenshot({ path: path.join(shots, "header-signed-out-desktop.png"), clip: { x: 0, y: 0, width: 1366, height: 140 } });
  const si = await open(DESKTOP, `demo-customer~s~${Date.now()}`);
  await si.page.goto(`${BASE}/about`, { waitUntil: "networkidle0" });
  const inBox = await si.page.evaluate(() => { const i = document.querySelector("#catalog-search"); const f = i.closest("div.border"); const r = f.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), font: getComputedStyle(i).fontSize, placeholder: i.placeholder, publicBox: document.querySelectorAll("[data-public-search]").length, header: Math.round(document.querySelector("header").getBoundingClientRect().height) }; });
  check("field size: the signed-out box has the signed-in box's width, height and 13px font", outBox.w === inBox.w && outBox.h === inBox.h && outBox.font === inBox.font && inBox.font === "13px", `out ${JSON.stringify(outBox)} in ${JSON.stringify(inBox)}`);
  check("header height is the same signed out and signed in (no extra text below the header)", outBox.header === inBox.header, `${outBox.header}/${inBox.header}`);
  check("signed-in search unchanged: its own box and placeholder, no public box", inBox.placeholder === "Search name or CAS #" && inBox.publicBox === 0);
  // Owner, 2026-11-21: the slot is 12.75rem (204px) at full desktop width. (The "Explore N Compounds" phrase it was
  // widened for was retired by Visual Package 2; the new phrases' fit is measured in t-visual2-ui.mjs.)
  const room = await so.page.evaluate(() => {
    const el = [...document.querySelectorAll("[data-public-search]")].find((e) => e.offsetParent !== null);
    return { slot: Math.round(el.parentElement.getBoundingClientRect().width) };
  });
  check("desktop: the search slot is 12.75rem (204px)", room.slot === 204, JSON.stringify(room));
  for (const width of [1280, 1366]) {
    await so.page.setViewport({ width, height: 860 });
    await so.page.goto(`${BASE}/about`, { waitUntil: "networkidle0" });
    const h = await so.page.evaluate(() => ({ header: Math.round(document.querySelector("header").getBoundingClientRect().height), overflow: document.documentElement.scrollWidth > window.innerWidth + 1 }));
    await so.page.screenshot({ path: path.join(shots, `header-signed-out-${width}.png`), clip: { x: 0, y: 0, width, height: 170 } });
    check(`header at ${width}px: same height as before (${outBox.header}px), no horizontal scroll`, h.header === outBox.header && !h.overflow, JSON.stringify(h));
  }
  await so.ctx.close(); await si.ctx.close();
}

// ---------- 3. product page Blend Composition ----------
for (const [label, viewport] of [["desktop", DESKTOP], ["phone", PHONE]]) {
  const { ctx, page } = await open(viewport, `demo-customer~s~${Date.now()}`);
  await page.goto(`${BASE}/shop/glow-blend`, { waitUntil: "networkidle0" });
  const g = await page.evaluate(() => { const s = document.querySelector("[data-blend-composition]"); if (!s) return null; const r = s.getBoundingClientRect();
    return { rows: [...s.querySelectorAll("dt")].map((d) => `${d.textContent}=${d.nextElementSibling.textContent}`), left: r.left, right: r.right, heroImg: Boolean(document.querySelector("main img")) }; });
  check(`${label}: GLOW page shows the Blend Composition section in order, inside the screen`, g?.rows.join(" | ") === "GHK-Cu=50mg | BPC-157=10mg | TB-4=10mg | Total per vial=70mg" && g.left >= 0 && g.right <= viewport.width && (await noHScroll(page)), JSON.stringify(g));
  // The hero vial: the page still renders GLOW's own stored image (server HTML). Locally the browser then drops it,
  // because the local network guard blocks the Vercel Blob host it lives on; in production it loads as before.
  const heroUrl = (await q("SELECT image_url FROM products WHERE slug = 'glow-blend'"))[0].image_url;
  const ssr = await (await fetch(`${BASE}/shop/glow-blend`, { headers: { Cookie: `vericert_age_ack=1; vericert_customer_session=${await token(`demo-customer~s~${Date.now()}`)}` } })).text();
  check(`${label}: the hero vial image is still rendered from GLOW's stored image`, Boolean(heroUrl) && ssr.includes(`aria-label="Enlarge image of GLOW Blend"`) && ssr.includes(encodeURIComponent(heroUrl)), heroUrl ? "stored image set" : "no stored image");
  await page.evaluate(() => document.querySelector("[data-blend-composition]")?.scrollIntoView({ block: "center" }));
  await page.screenshot({ path: path.join(shots, `glow-composition-${label}.png`) });
  await page.goto(`${BASE}/shop/wolverine-blend`, { waitUntil: "networkidle0" });
  const w = await page.evaluate(() => { const s = document.querySelector("[data-blend-composition]"); return { rows: s ? [...s.querySelectorAll("dt")].map((d) => `${d.textContent}=${d.nextElementSibling.textContent}`) : null, strengthChip: /10mg \/ 10mg/.test(document.body.innerText), right: s?.getBoundingClientRect().right ?? 0 }; });
  check(`${label}: WOLVERINE page shows BPC-157 10mg, TB-4 10mg, total 20mg; strength "10mg / 10mg" unchanged`, w.rows?.join(" | ") === "BPC-157=10mg | TB-4=10mg | Total per vial=20mg" && w.strengthChip && w.right <= viewport.width && (await noHScroll(page)), JSON.stringify(w));
  await page.evaluate(() => document.querySelector("[data-blend-composition]")?.scrollIntoView({ block: "center" }));
  await page.screenshot({ path: path.join(shots, `wolverine-${label}.png`), fullPage: false });
  await ctx.close();
}

// ---------- 4. Executive Office → Blends ----------
{
  const { ctx, page } = await open(DESKTOP, `demo-command~2fa~${Date.now()}`);
  await page.goto(`${BASE}/command?tab=blends`, { waitUntil: "networkidle0" });
  await page.waitForSelector("[data-blends-table]", { timeout: 15000 });
  const t = await page.evaluate(() => ({ rows: [...document.querySelectorAll("[data-blend]")].map((r) => ({ slug: r.dataset.blend, flagged: r.dataset.flagged, comp: r.querySelector("[data-composition]")?.textContent ?? null })),
    summary: document.querySelector("[data-blend-summary]")?.textContent }));
  check("Blends tab: lists every blend strength with its composition", t.rows.find((r) => r.slug === "glow-blend")?.comp === "GHK-Cu 50mg · BPC-157 10mg · TB-4 10mg = 70mg", JSON.stringify(t.rows.find((r) => r.slug === "glow-blend")));
  check("Blends tab: WOLVERINE shows its composition; only the hidden Semax/Selank says 'Needs composition'",
    t.rows.find((r) => r.slug === "wolverine-blend")?.comp === "BPC-157 10mg · TB-4 10mg = 20mg" && t.rows.filter((r) => r.flagged === "1").every((r) => r.slug === "semax-selank-blend") && /1 needs/.test(t.summary ?? ""), t.summary);
  await page.click('[data-edit-blend="klow-blend"]');
  await page.waitForSelector("[data-blend-editor]");
  const ed = await page.evaluate(() => [...document.querySelectorAll("[data-ingredient-row]")].map((r) => `${r.querySelector("select").value}:${r.querySelector("[data-ingredient-amount]").value}`));
  check("editor: KLOW's ingredients load in order with their permanent ids", ed.join(",") === "ghk-cu:50,bpc-157:10,tb-4:10,kpv:10", ed.join(","));
  const amt = await page.$$("[data-ingredient-amount]");
  const setAmount = async (h, text) => { await h.click(); await page.keyboard.down("Control"); await page.keyboard.press("KeyA"); await page.keyboard.up("Control"); await h.type(text); };
  await setAmount(amt[3], "15");
  const live = await page.evaluate(() => ({ err: document.querySelector("[data-blend-errors]")?.textContent ?? "", disabled: document.querySelector("[data-save-blend]").disabled, sum: document.querySelector("[data-running-sum]").textContent }));
  check("editor: a mismatched total is caught before saving (clear message, Save disabled)", /add up to 85mg, but the declared total is 80mg/.test(live.err) && live.disabled && /85mg of 80mg/.test(live.sum), JSON.stringify(live));
  await setAmount(amt[3], "10");
  const ups = await page.$$("[data-move-up]");
  await ups[3].click();
  await page.click("[data-save-blend]");
  await page.waitForSelector("[data-blend-message]", { timeout: 10000 });
  const saved = await q(`SELECT string_agg(component_slug, ',' ORDER BY position) AS o FROM blend_components b JOIN blend_compositions c USING (blend_strength_id) WHERE c.blend_slug = 'klow-blend'`);
  check("editor: reorder (KPV up one) and save → stored in the new order", saved[0].o === "ghk-cu,bpc-157,kpv,tb-4", saved[0].o);
  await page.screenshot({ path: path.join(shots, "blends-tab.png") });
  await ctx.close();
}
const klowSid = (await q("SELECT id FROM product_strengths WHERE product_slug = 'klow-blend' AND active"))[0].id;
const cmd = `vericert_customer_session=${await token(`demo-command~2fa~${Date.now()}`)}`;
const back = await fetch(`${BASE}/api/executive/blends/${klowSid}`, { method: "PUT", headers: { "Content-Type": "application/json", Cookie: cmd },
  body: JSON.stringify({ declaredTotalMg: 80, ingredients: [["ghk-cu", 50], ["bpc-157", 10], ["tb-4", 10], ["kpv", 10]].map(([componentSlug, amountMg]) => ({ componentSlug, amountMg })) }) });
check("KLOW restored to the owner's order after the UI test", back.status === 200);

await browser.close().catch(() => {});
edge.kill();
await pool.end();
console.log(`\n[R1-UI] ${pass} passed, ${fail} failed (${pass + fail} checks)${failures.length ? `\nFAILED: ${failures.join(" | ")}` : ""}`);
process.exit(fail ? 1 : 0);
