// LIVE, SIGNED-OUT, NON-MUTATING checks of Website Refinements Package 1 on https://vericertpeptides.com.
// Only GETs, refused requests and page navigation (headless Edge). No account, nothing created or changed. The only
// cookie set is the site's own 21+ acknowledgement, as a visitor clicking through the age gate would get.
// Run from a folder with puppeteer-core installed: node t-live-r1-signed-out.mjs
import { spawn } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import puppeteer from "puppeteer-core";

const BASE = "https://vericertpeptides.com";
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const shots = path.join(path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Z]:)/, "$1"), "shots-live-r1");
fs.mkdirSync(shots, { recursive: true });
let pass = 0, fail = 0; const failures = [];
const check = (name, ok, detail = "") => { if (ok) pass++; else { fail++; failures.push(name); } console.log(`${ok ? "PASS" : "FAIL"}  [LIVE-R1] ${name}${detail ? `  — ${detail}` : ""}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const AGE = "vericert_age_ack=1";
const get = async (p, cookie = AGE) => { const r = await fetch(BASE + p, { redirect: "manual", headers: { Cookie: cookie } }); return { status: r.status, location: r.headers.get("location") ?? "", text: await r.text(), cc: r.headers.get("cache-control") ?? "" }; };
const text = (html) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/\s+/g, " ");

// ---------- HTTP ----------
const pubRes = await get("/api/public-catalog");
const pub = JSON.parse(pubRes.text);
const C = pub.compounds;
check("public list: 200 signed out, shared-cacheable", pubRes.status === 200 && /public/.test(pubRes.cc));
check(`public list: count ${pub.count} = entries ${C.length}, one per compound`, pub.count === C.length && new Set(C.map((c) => c.slug)).size === C.length);
check("public list: BAC Water not listed or counted", !C.some((c) => c.slug === "bac-water"));
check("public list: hidden products absent (TB-500, CJC-1295 No DAC, Semax/Selank)", !C.some((c) => ["tb-500", "cjc-1295-no-dac", "semax-selank-blend"].includes(c.slug)));
check("public list: BPC-157 shows only its active 10mg strength (deactivated 20mg absent)", JSON.stringify(C.find((c) => c.slug === "bpc-157")?.strengths.map((s) => s.label)) === '["10mg"]');
check("public list: alphabetical", C.every((c, i) => i === 0 || C[i - 1].name.localeCompare(c.name, "en", { sensitivity: "base" }) <= 0));
const allowed = new Set(["slug", "name", "alternateNames", "casNumber", "imageUrl", "strengths"]);
check("public list: only name / alternate names / CAS / photo / strengths + prices (no stock, SKU, purity, cost, lot)", C.every((c) => Object.keys(c).every((k) => allowed.has(k)) && c.strengths.every((s) => Object.keys(s).join() === "label,price")));
check("public list: effective price = regular price everywhere (no public promotion)", C.every((c) => c.strengths.every((s) => s.price.effectiveUsd === s.price.regularUsd)));
const tb4 = C.find((c) => c.slug === "tb-4");
check("public list: TB-4 is 'TB-4 (Full Length)' with alternate name 'TB-4'", tb4?.name === "TB-4 (Full Length)" && tb4.alternateNames?.includes("TB-4"), JSON.stringify(tb4 && { name: tb4.name, alt: tb4.alternateNames }));
check("public list: all four blends listed (GLOW, KLOW, CJC/Ipamorelin, WOLVERINE)", ["glow-blend", "klow-blend", "cjc-1295-ipamorelin-blend", "wolverine-blend"].every((s) => C.some((c) => c.slug === s)));
check("signed-in catalog /api/catalog still refuses signed-out (401)", (await get("/api/catalog")).status === 401);
const shop = await get("/shop");
check("/shop still redirects signed-out visitors to /register", [307, 308].includes(shop.status) && /\/register/.test(shop.location), `${shop.status} ${shop.location}`);
for (const slug of ["glow-blend", "wolverine-blend", "bac-water"]) {
  const r = await get(`/shop/${slug}`);
  check(`/shop/${slug} still redirects signed-out visitors to /register`, [307, 308].includes(r.status) && /\/register/.test(r.location), `${r.status}`);
}
for (const [m, p] of [["GET", "/api/executive/blends"], ["PUT", "/api/executive/blends/x"], ["DELETE", "/api/executive/blends/x"]]) {
  const r = await fetch(BASE + p, { method: m, redirect: "manual", headers: { "Content-Type": "application/json" }, body: m === "PUT" ? "{}" : undefined });
  check(`${m} ${p}: signed out → 401`, r.status === 401, String(r.status));
}
check("cron routes still refuse a missing secret (401)", (await get("/api/cron/reservations")).status === 401);
const home = text((await get("/")).text);
check("footer: 'by qualified researchers and professional entities.'", home.includes("by qualified researchers and professional entities.") && !home.includes("by qualified professional entities."));
check("register: new sentence", text((await get("/register")).text).includes("Create an account to access our full research catalog, place orders, and manage your research purchases."));
const priv = text((await get("/privacy-policy")).text);
check("privacy: both approved sentences present, both old ones gone",
  priv.includes("Placing orders and accessing registered researcher account features requires registration.") && priv.includes("Compound names and public pricing can be viewed without an account; registration is required for full product details, inventory availability, and purchasing.")
  && !priv.includes("Access to the catalog is restricted to registered accounts.") && !priv.includes("product information, and ordering requires registration."));
const terms = text((await get("/terms")).text);
check("terms §11: new sentence after 'Pricing and availability', old gone", /Pricing and availability\s+Prices are in U\.S\. dollars and are displayed alongside eligible product listings\./.test(terms) && !terms.includes("shown to signed-in customers"));
const about = text((await get("/about")).text);
check("About: approved sentence present, old gone", about.includes("Visitors can view our compound names and public pricing. Registration is required for full product details, inventory availability, and purchasing, and is open to research customers") && !about.includes("is reserved for registered research customers"));

// ---------- browser ----------
const profile = path.join(os.tmpdir(), `edge-live-r1-${Date.now()}`);
const edge = spawn(EDGE, ["--headless=new", `--user-data-dir=${profile}`, "--remote-debugging-port=9337", "--no-first-run", "--disable-gpu", "about:blank"], { stdio: "ignore" });
let browser; for (let i = 0; i < 40 && !browser; i++) { try { browser = await puppeteer.connect({ browserURL: "http://127.0.0.1:9337" }); } catch { await sleep(250); } }
const casCompound = C.find((c) => /\d{2,7}-\d{2}-\d/.test(c.casNumber ?? ""));
const cas = casCompound?.casNumber.match(/\d{2,7}-\d{2}-\d/)[0];
for (const [label, viewport] of [["desktop", { width: 1366, height: 860 }], ["phone", { width: 390, height: 844, isMobile: true, hasTouch: true }]]) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport(viewport);
  await ctx.setCookie({ name: "vericert_age_ack", value: "1", domain: "vericertpeptides.com", path: "/" });
  await page.goto(`${BASE}/about`, { waitUntil: "networkidle2" });
  const box = await page.evaluateHandle(() => [...document.querySelectorAll("[data-public-search]")].find((e) => e.offsetParent !== null) ?? null);
  const present = await box.evaluate((e) => Boolean(e));
  check(`${label}: the signed-out header shows the compound search`, present);
  if (!present) { await ctx.close(); continue; }
  const ph = () => box.evaluate((el) => { const s = el.querySelector("[data-placeholder]"); if (!s) return null; const v = [...s.children].find((c) => getComputedStyle(c).display !== "none") ?? s; return { t: s.innerText, o: Number(getComputedStyle(s).opacity), w: v.scrollWidth, room: v.clientWidth, clipped: v.scrollWidth > v.clientWidth + 0.5 }; });
  // Package 3 wording: "COMPOUNDS & PRICES" at full desktop width, the full phrase on a phone; then "SEARCH COMPOUNDS".
  const pricing = label === "phone" ? "VIEW COMPOUNDS & PRICES" : "COMPOUNDS & PRICES";
  const seen = new Set(); let fit = null;
  for (let i = 0; i < 80; i++) { const p = await ph(); if (p) { seen.add(p.t); if (p.t === pricing && p.o === 1) fit = p; } if (seen.size === 2 && fit) break; await sleep(100); }
  check(`${label}: placeholder alternates "${pricing}" / "SEARCH COMPOUNDS" (no count)`, seen.has(pricing) && seen.has("SEARCH COMPOUNDS"), [...seen].join(" / "));
  check(`${label}: "${pricing}" fits without truncation`, fit && !fit.clipped && fit.w <= fit.room, fit ? `${fit.w}px in ${fit.room}px` : "not captured");
  const field = await box.evaluate((el) => { const r = el.querySelector("div.border").getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
  await page.screenshot({ path: path.join(shots, `placeholder-${label}.png`), clip: { x: Math.max(0, field.x - 30), y: Math.max(0, field.y - 20), width: Math.min(viewport.width - Math.max(0, field.x - 30), field.w + 60), height: field.h + 40 } });
  if (label === "desktop") {
    check("desktop: search field is 204px wide (12.75rem)", Math.round(field.w) === 204, `${field.w}px`);
    await page.screenshot({ path: path.join(shots, "header-desktop.png"), clip: { x: 0, y: 0, width: 1366, height: Math.ceil(field.y + field.h + 30) } });
  }
  const input = await box.evaluateHandle((el) => el.querySelector("input"));
  await input.focus(); await sleep(300);
  const empty = await page.evaluate(() => { const p = [...document.querySelectorAll("[data-public-results]")].find((e) => e.offsetParent !== null); return p ? { results: p.querySelectorAll("[data-public-result]").length, va: p.querySelector("[data-view-all]")?.textContent } : null; });
  check(`${label}: focus with an empty field shows only "View All Compounds & Prices →" (no count)`, empty?.results === 0 && empty.va === "View All Compounds & Prices →", JSON.stringify(empty));
  const results = async (q) => { await input.evaluate((el) => el.select()); await input.type(q); await sleep(400); return page.evaluate(() => [...document.querySelectorAll("[data-public-result]")].filter((e) => e.offsetParent !== null).map((e) => ({ slug: e.dataset.publicResult, strengths: [...e.querySelectorAll("[data-public-strength]")].map((s) => s.textContent.replace(/\s+/g, " ").trim()) }))); };
  const bpc = (await results("bpc")).find((r) => r.slug === "bpc-157");
  const bpcApi = C.find((c) => c.slug === "bpc-157");
  check(`${label}: "bpc" finds BPC-157 with its strength and price exactly as the public list`, JSON.stringify(bpc?.strengths) === JSON.stringify(bpcApi.strengths.map((s) => `${s.label} · $${s.price.regularUsd.toFixed(2)}`)), JSON.stringify(bpc));
  if (cas) { const r = await results(cas); check(`${label}: CAS ${cas} finds ${casCompound.name} first`, r[0]?.slug === casCompound.slug, r.map((x) => x.slug).join(",")); }
  const alt = await results("TB-4"); check(`${label}: "TB-4" finds TB-4 (Full Length)`, alt.some((r) => r.slug === "tb-4"), alt.map((x) => x.slug).join(","));
  const bac = await results("bac"); check(`${label}: "bac" does not find BAC Water signed out`, !bac.some((r) => r.slug === "bac-water"), bac.map((x) => x.slug).join(",") || "no results");
  const t5 = await results("tb-500"); check(`${label}: hidden TB-500 not searchable signed out`, !t5.some((r) => r.slug === "tb-500"), t5.map((x) => x.slug).join(",") || "no results");
  await results("glow");
  if (label === "desktop") await page.screenshot({ path: path.join(shots, "results-desktop.png") });
  await Promise.all([page.waitForNavigation({ waitUntil: "networkidle2" }), page.evaluate(() => [...document.querySelectorAll("[data-public-result] a")].find((a) => a.offsetParent !== null).click())]);
  check(`${label}: choosing a compound goes to /register`, new URL(page.url()).pathname === "/register", page.url());
  await page.goto(`${BASE}/about`, { waitUntil: "networkidle2" });
  const box2 = await page.evaluateHandle(() => [...document.querySelectorAll("[data-public-search]")].find((e) => e.offsetParent !== null));
  await (await box2.evaluateHandle((el) => el.querySelector("input"))).focus(); await sleep(300);
  await page.evaluate(() => [...document.querySelectorAll("[data-view-all]")].find((b) => b.offsetParent !== null).click());
  await page.waitForSelector("[data-compound-list]", { visible: true });
  const list = await page.evaluate(() => { const dlg = document.querySelector("[data-compound-list] [role=dialog]").getBoundingClientRect(); const o = document.querySelector("[data-compound-list]").getBoundingClientRect();
    const rows = [...document.querySelectorAll("[data-compound-row]")]; return { n: rows.length, names: rows.map((r) => r.querySelector("a").textContent), visible: rows.filter((r) => { const b = r.getBoundingClientRect(); return b.top >= dlg.top && b.bottom <= dlg.bottom; }).length, overlay: { t: o.top, l: o.left, w: o.width, h: o.height }, dlgH: dlg.height, overflow: document.documentElement.scrollWidth > window.innerWidth + 1 }; });
  check(`${label}: View All lists all ${pub.count} compounds alphabetically, BAC Water absent`, list.n === pub.count && JSON.stringify(list.names) === JSON.stringify(C.map((c) => c.name)) && !list.names.includes("BAC Water"), `${list.n} rows`);
  check(`${label}: View All covers the screen and is readable (not confined to the header)`, list.overlay.t === 0 && list.overlay.l === 0 && Math.round(list.overlay.h) === viewport.height && list.dlgH >= viewport.height * 0.6 && list.visible >= 6 && !list.overflow, `${Math.round(list.dlgH)}px, ${list.visible} rows visible`);
  await page.screenshot({ path: path.join(shots, `view-all-${label}.png`) });
  await Promise.all([page.waitForNavigation({ waitUntil: "networkidle2" }), page.evaluate(() => document.querySelector("[data-compound-row] a").click())]);
  check(`${label}: choosing a compound in View All goes to /register`, new URL(page.url()).pathname === "/register");
  await ctx.close();
}
await browser.close().catch(() => {}); edge.kill();
console.log(`\n[LIVE-R1] ${pass} passed, ${fail} failed (${pass + fail} checks)${failures.length ? `\nFAILED: ${failures.join(" | ")}` : ""}`);
process.exit(fail ? 1 : 0);
