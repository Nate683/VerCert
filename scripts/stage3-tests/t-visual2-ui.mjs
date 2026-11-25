// LOCAL ONLY. Website Visual Refinements Package 2 — browser tests (headless Edge) against http://localhost:3300
// (SNAP=ref1 bash cycle.sh) and the local test DB. Every colour is measured as RENDERED: the element's computed colour
// (with any alpha) composited over the real stack of backgrounds beneath it, then WCAG contrast. Screenshots go to
// shots-v2/ for the report. Prints a MEASUREMENTS block (contrast and placeholder widths) for the report.
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import pg from "pg";
import puppeteer from "puppeteer-core";

const BASE = "http://localhost:3300";
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const here = path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Z]:)/, "$1");
const profile = path.join(here, "edge-profile-v2");
const shots = path.join(here, "shots-v2");
fs.rmSync(profile, { recursive: true, force: true });
fs.mkdirSync(shots, { recursive: true });
const edge = spawn(EDGE, ["--headless=new", `--user-data-dir=${profile}`, "--remote-debugging-port=9338", "--no-first-run", "--disable-gpu", "about:blank"], { stdio: "ignore" });
const pool = new pg.Pool({ host: "127.0.0.1", port: 5491, user: "demo", password: "demo", database: "demo", max: 3 });
const q = async (t, p = []) => (await pool.query(t, p)).rows;
let pass = 0, fail = 0; const failures = []; const M = [];
const check = (name, ok, detail = "") => { if (ok) pass++; else { fail++; failures.push(name); } console.log(`${ok ? "PASS" : "FAIL"}  [V2-UI] ${name}${detail ? `  — ${detail}` : ""}`); };
const measure = (line) => { M.push(line); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const enc = new TextEncoder();
async function sign(v) { const d = await crypto.subtle.digest("SHA-256", enc.encode("demo-session-secret")); const k = await crypto.subtle.importKey("raw", d, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]); return Buffer.from(await crypto.subtle.sign("HMAC", k, enc.encode(v))).toString("hex"); }
async function token(payload) { const s = `${payload}.${Date.now() + 3600_000}`; return `${s}.${await sign(s)}`; }
let browser; for (let i = 0; i < 40 && !browser; i++) { try { browser = await puppeteer.connect({ browserURL: "http://127.0.0.1:9338" }); } catch { await sleep(250); } }
if (!browser) throw new Error("Edge did not start");
async function open(viewport, userPayload = null) {
  const ctx = await browser.createBrowserContext(); const page = await ctx.newPage(); await page.setViewport(viewport);
  const cookies = [{ name: "vericert_age_ack", value: "1", domain: "localhost", path: "/" }];
  if (userPayload) cookies.push({ name: "vericert_customer_session", value: await token(userPayload), domain: "localhost", path: "/" });
  await ctx.setCookie(...cookies); return { ctx, page };
}
// Installs window.__contrast(el) → { fg, bg, ratio } and window.__rgb(cssColor) in the page.
const installContrast = (page) => page.evaluate(() => {
  const cv = document.createElement("canvas"); cv.width = cv.height = 1; const cx = cv.getContext("2d", { willReadFrequently: true });
  const parse = (c) => { cx.clearRect(0, 0, 1, 1); cx.fillStyle = "rgba(0,0,0,0)"; cx.fillStyle = c; cx.fillRect(0, 0, 1, 1); const d = cx.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255]; };
  const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const blend = (top, under) => under.map((v, i) => v * (1 - top[3]) + top[i] * top[3]);
  const hex = (c) => "#" + c.slice(0, 3).map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
  window.__bg = (el) => { let bg = [255, 255, 255]; const chain = []; for (let n = el; n; n = n.parentElement) chain.unshift(n); for (const n of chain) { const c = parse(getComputedStyle(n).backgroundColor); if (c[3] > 0) bg = blend(c, bg); } return bg; };
  window.__contrast = (el, fgEl = el) => { const bg = window.__bg(el); const fg = blend(parse(getComputedStyle(fgEl).color), bg); const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x); return { fg: hex(fg), bg: hex(bg), ratio: Math.round(((a + 0.05) / (b + 0.05)) * 100) / 100 }; };
  window.__rgb = (c) => hex(parse(c)); window.__parse = parse;
});
const noHScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const pubData = await (await fetch(`${BASE}/api/public-catalog`)).json();
const COUNT = pubData.count;
const VIEWPORTS = [["desktop-1366", { width: 1366, height: 860 }], ["desktop-1280", { width: 1280, height: 800 }], ["phone-390", { width: 390, height: 844, isMobile: true, hasTouch: true }], ["phone-360", { width: 360, height: 760, isMobile: true, hasTouch: true }]];
const visibleBox = (page) => page.evaluateHandle(() => [...document.querySelectorAll("[data-public-search]")].find((e) => e.offsetParent !== null) ?? null);

// ---------- 1. field + placeholder, at every width ----------
for (const [label, viewport] of VIEWPORTS) {
  const phone = label.startsWith("phone");
  const { ctx, page } = await open(viewport);
  await page.goto(`${BASE}/about`, { waitUntil: "networkidle0" });
  if (phone) { await page.click('button[aria-label="Toggle menu"]'); await sleep(400); }
  await installContrast(page);
  const box = await visibleBox(page);
  // Owner, 2026-11-23: "COMPOUNDS & PRICES" at full desktop width, the full phrase on smaller layouts.
  const PRICING = phone ? "VIEW COMPOUNDS & PRICES" : "COMPOUNDS & PRICES";
  // The first phrase right after load (the visible text).
  const first = await box.evaluate((el) => el.querySelector("[data-placeholder]")?.innerText);
  check(`${label}: "${PRICING}" is the first phrase on load`, first === PRICING, first);
  // Natural width of each phrase as displayed at this width, in the field's own computed font, against the real room
  // (the placeholder's box inside the field). Measured on a detached, unconstrained copy, so it can't be clamped.
  const widths = await box.evaluate((el, phrases) => {
    const s = el.querySelector("[data-placeholder]"); const room = s.clientWidth; const cs = getComputedStyle(s);
    const out = {};
    for (const t of phrases) {
      const m = document.createElement("span"); m.textContent = t;
      Object.assign(m.style, { position: "absolute", visibility: "hidden", whiteSpace: "nowrap", font: cs.font, letterSpacing: cs.letterSpacing, textTransform: cs.textTransform });
      document.body.appendChild(m); const w = m.getBoundingClientRect().width; m.remove();
      out[t] = { text: Math.ceil(w), room, fits: w <= room };
    }
    return out;
  }, [PRICING, "SEARCH COMPOUNDS"]);
  // Whatever the fit, the visible placeholder must stay inside the field's border (never paint over the header).
  const contained = await box.evaluate((el) => { const f = el.querySelector("[data-public-field]").getBoundingClientRect(); const inner = [...el.querySelectorAll("[data-placeholder] > span")].find((x) => getComputedStyle(x).display !== "none"); const r = inner.getBoundingClientRect();
    return { right: Math.round(r.right), fieldRight: Math.round(f.right), ellipsis: getComputedStyle(inner).textOverflow }; });
  check(`${label}: the placeholder stays inside the field border (overflow ends in an ellipsis)`, contained.right <= contained.fieldRight && contained.ellipsis === "ellipsis", JSON.stringify(contained));
  for (const [t, w] of Object.entries(widths)) {
    measure(`placeholder ${label}: "${t}" ${w.text}px of text in ${w.room}px of space → ${w.fits ? `fits (${w.room - w.text}px spare)` : `DOES NOT FIT (${w.text - w.room}px short)`}`);
    check(`${label}: "${t}" fits without clipping (${w.text}px in ${w.room}px)`, w.fits, w.fits ? "" : `${w.text - w.room}px short — see report`);
  }
  const field = await box.evaluate((el) => { const f = el.querySelector("[data-public-field]"); const cs = getComputedStyle(f); const r = f.getBoundingClientRect();
    return { border: window.__rgb(cs.borderTopColor), borderW: cs.borderTopWidth, bg: window.__rgb(cs.backgroundColor), x: r.x, y: r.y, w: r.width, h: r.height }; });
  if (label === "desktop-1366") {
    const header = await page.evaluate(() => window.__rgb(getComputedStyle(document.querySelector("header")).backgroundColor));
    check("field: thin gold border (1px, brand gold at 40%) on slate blue #223255, lighter than the header navy", field.borderW === "1px" && field.bg === "#223255" && /^#/.test(field.border), JSON.stringify({ ...field, header }));
    const fieldVsHeader = await page.evaluate(() => { const f = document.querySelector("[data-public-field]"); const lum = (h) => { const n = parseInt(h.slice(1), 16); const c = [n >> 16, (n >> 8) & 255, n & 255].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
      return { field: lum(window.__rgb(getComputedStyle(f).backgroundColor)), header: lum(window.__rgb("#132544")) }; });
    check("field background is lighter than the header navy", fieldVsHeader.field > fieldVsHeader.header, JSON.stringify(fieldVsHeader));
    const borderContrast = await page.evaluate(() => { const f = document.querySelector("[data-public-field]"); const p = window.__parse(getComputedStyle(f).borderTopColor); const bg = window.__bg(f.parentElement); const mix = bg.map((v, i) => v * (1 - p[3]) + p[i] * p[3]);
      const lum = ([r, g, b]) => { const g2 = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * g2(r) + 0.7152 * g2(g) + 0.0722 * g2(b); };
      const [a, b] = [lum(mix), lum(bg)].sort((x, y) => y - x); return Math.round(((a + 0.05) / (b + 0.05)) * 100) / 100; });
    measure(`field border (gold 40%) vs header: ${borderContrast}:1 (decorative; the field is also identified by its slate background and icon)`);
  }
  // Colours and contrast of both phrases; durations; the fade.
  // Re-queried every time (no long-held handle), and tolerant of a page transition in progress.
  const sample = () => page.evaluate(() => {
    const el = [...document.querySelectorAll("[data-public-search]")].find((e) => e.offsetParent !== null); const s = el?.querySelector("[data-placeholder]");
    if (!window.__contrast) return undefined;
    return s ? { t: s.innerText, o: Number(getComputedStyle(s).opacity), c: window.__contrast(s), color: window.__rgb(getComputedStyle(s).color) } : null;
  }).catch(() => undefined);
  const seen = {}; const changes = []; let last = null; let minO = 1; const t0 = Date.now();
  while (Date.now() - t0 < 15500) { const s = await sample(); if (s === undefined) await installContrast(page).catch(() => {}); if (s) { minO = Math.min(minO, s.o); if (s.o === 1) seen[s.t] ??= s; if (s.t !== last) { changes.push({ t: s.t, at: Date.now() - t0 }); last = s.t; } } await sleep(50); }
  const holds = changes.slice(1, -1).map((c, i) => ({ t: c.t, ms: changes[i + 2].at - c.at }));
  const viewHold = holds.filter((h) => h.t === PRICING).map((h) => h.ms), searchHold = holds.filter((h) => h.t.startsWith("SEARCH")).map((h) => h.ms);
  check(`${label}: the pricing phrase lasts longer than the search phrase (≈4.8 s vs ≈2.8 s per cycle incl. fade)`, viewHold.length > 0 && searchHold.length > 0 && Math.min(...viewHold) > Math.max(...searchHold) + 1000, `VIEW ${viewHold.join("/")} ms, SEARCH ${searchHold.join("/")} ms`);
  check(`${label}: soft fade between phrases (opacity dips)`, minO < 0.6, `min opacity ${minO.toFixed(2)}`);
  const v = seen[PRICING], s = seen["SEARCH COMPOUNDS"];
  const navColor = phone ? null : await page.evaluate(() => { const a = [...document.querySelectorAll("header nav a")].find((x) => !/text-gold/.test(x.className)); return a ? window.__rgb(getComputedStyle(a).color) : null; });
  check(`${label}: "${PRICING}" in brand gold, uppercase`, v?.color === "#c9a227", v?.color);
  check(`${label}: "SEARCH COMPOUNDS" in the navigation gray (same colour as SHOP / ABOUT links)`, Boolean(s) && (phone || s.color === navColor) && s.color !== "#ffffff", `${s?.color} vs nav ${navColor ?? "(nav hidden on phone; same class)"}`);
  if (label === "desktop-1366" || label === "phone-390") {
    measure(`${label} placeholder "${PRICING}": ${v.c.fg} on ${v.c.bg} → ${v.c.ratio}:1`);
    measure(`${label} placeholder "SEARCH COMPOUNDS": ${s.c.fg} on ${s.c.bg} → ${s.c.ratio}:1`);
  }
  check(`${label}: both phrases ≥ 4.5:1 on the field`, v.c.ratio >= 4.5 && s.c.ratio >= 4.5, `${v.c.ratio} / ${s.c.ratio}`);
  // Screenshots of both states.
  for (const [want, file] of [[PRICING, "view"], ["SEARCH COMPOUNDS", "search"]]) {
    for (let i = 0; i < 160; i++) { const x = await sample(); if (x?.t === want && x.o === 1) break; await sleep(50); }
    await page.screenshot({ path: path.join(shots, `placeholder-${file}-${label}.png`), clip: { x: Math.max(0, field.x - 30), y: Math.max(0, field.y - 18), width: Math.min(viewport.width - Math.max(0, field.x - 30), field.w + 60), height: field.h + 36 } });
  }
  if (label === "desktop-1366" || label === "desktop-1280") await page.screenshot({ path: path.join(shots, `header-${label}.png`), clip: { x: 0, y: 0, width: viewport.width, height: Math.ceil(field.y + field.h + 24) } });
  // Header height and overflow unchanged.
  const h = await page.evaluate(() => Math.round(document.querySelector("header").getBoundingClientRect().height));
  if (!phone) check(`${label}: header height unchanged (87px) and no horizontal scroll`, h === 87 && (await noHScroll(page)), `${h}px`);
  else check(`${label}: no horizontal scroll`, await noHScroll(page));
  // Focus stops rotation; typing hides the placeholder. (If the page re-rendered, re-install the measuring helpers.)
  await installContrast(page);
  const input = await (await visibleBox(page)).evaluateHandle((el) => el.querySelector("input"));
  await input.focus(); const atFocus = (await sample())?.t; const frozen = new Set();
  for (let i = 0; i < 50; i++) { frozen.add((await sample())?.t); await sleep(100); }
  check(`${label}: rotation stops on focus (5 s unchanged)`, frozen.size === 1 && frozen.has(atFocus), [...frozen].join(" / "));
  await input.type("b"); await sleep(150); check(`${label}: typing hides the placeholder`, (await sample()) === null);
  await ctx.close();
}

// ---------- 2. dropdown ----------
for (const [label, viewport] of [["desktop", { width: 1366, height: 860 }], ["phone", { width: 390, height: 844, isMobile: true, hasTouch: true }]]) {
  const { ctx, page } = await open(viewport);
  await page.goto(`${BASE}/about`, { waitUntil: "networkidle0" });
  if (label === "phone") { await page.click('button[aria-label="Toggle menu"]'); await sleep(400); }
  await installContrast(page);
  const box = await visibleBox(page);
  const input = await box.evaluateHandle((el) => el.querySelector("input"));
  await input.focus(); await sleep(300);
  const va = await page.evaluate(() => { const b = [...document.querySelectorAll("[data-view-all]")].find((x) => x.offsetParent !== null); return b ? { text: b.innerText.trim(), c: window.__contrast(b) } : null; });
  check(`${label}: empty field shows "VIEW ALL ${COUNT} COMPOUNDS & PRICES →" (uppercase, arrow, live count)`, va?.text === `VIEW ALL ${COUNT} COMPOUNDS & PRICES →`, va?.text);
  if (label === "desktop") measure(`dropdown "VIEW ALL … →" (gold 85%): ${va.c.fg} on ${va.c.bg} → ${va.c.ratio}:1`);
  await input.type("bpc"); await sleep(400);
  const d = await page.evaluate(() => {
    const panel = [...document.querySelectorAll("[data-public-results]")].find((p) => p.offsetParent !== null);
    const row = panel.querySelector('[data-public-result="bpc-157"]'); const name = row.querySelector("[data-public-name]"); const str = row.querySelector("[data-public-strength]"); const price = row.querySelector("[data-public-price]");
    const thumb = row.querySelector("[data-public-thumb]"); const img = thumb.querySelector("img"); const note = panel.querySelector("[data-register-note]");
    return { panelBg: window.__rgb(getComputedStyle(panel).backgroundColor), name: window.__contrast(name), nameColor: window.__rgb(getComputedStyle(name).color), strength: window.__contrast(str), price: window.__contrast(price),
      priceColor: window.__rgb(getComputedStyle(price).color), strengthText: str.innerText, note: note ? { text: note.innerText.trim(), c: window.__contrast(note) } : null,
      thumb: { w: thumb.getBoundingClientRect().width, h: thumb.getBoundingClientRect().height, fit: img ? getComputedStyle(img).objectFit : null, imgs: row.querySelectorAll("img").length },
      thumbsPerRow: [...panel.querySelectorAll("[data-public-result]")].map((r) => r.querySelectorAll("[data-public-thumb]").length) };
  });
  check(`${label}: dropdown background is charcoal (#20262d)`, d.panelBg === "#20262d", d.panelBg);
  const isGray = (hex) => { const n = parseInt(hex.slice(1), 16); const [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255]; return Math.max(r, g, b) - Math.min(r, g, b) < 24 && r < 235; };
  check(`${label}: compound name is gray, not white`, isGray(d.name.fg) && d.name.fg !== "#ffffff", d.name.fg);
  check(`${label}: strengths gray, prices brand gold (#c9a227)`, isGray(d.strength.fg) && d.priceColor === "#c9a227", `${d.strength.fg} / ${d.priceColor}`);
  check(`${label}: BPC-157 strength and price exactly as the catalog`, d.strengthText.replace(/\s+/g, " ") === pubData.compounds.find((c) => c.slug === "bpc-157").strengths.map((s) => `${s.label} · $${s.price.regularUsd.toFixed(2)}`).join(""), d.strengthText);
  check(`${label}: thumbnail 56×56 (was 40), whole image shown (object-fit: contain), one per compound`, Math.round(d.thumb.w) === 56 && Math.round(d.thumb.h) === 56 && (d.thumb.fit === "contain" || d.thumb.imgs === 0) && d.thumbsPerRow.every((n) => n === 1), JSON.stringify(d.thumb));
  check(`${label}: registration note present`, d.note?.text === "Select a compound to view details — free registration required.", d.note?.text);
  if (label === "desktop") {
    measure(`dropdown compound name (white 75%): ${d.name.fg} on ${d.name.bg} → ${d.name.ratio}:1`);
    measure(`dropdown strength (white 60%): ${d.strength.fg} on ${d.strength.bg} → ${d.strength.ratio}:1`);
    measure(`dropdown price (brand gold): ${d.price.fg} on ${d.price.bg} → ${d.price.ratio}:1`);
    measure(`dropdown registration note (white 60%): ${d.note.c.fg} on ${d.note.c.bg} → ${d.note.c.ratio}:1`);
  }
  check(`${label}: every dropdown text ≥ 4.5:1`, [d.name, d.strength, d.price, d.note.c, va.c].every((x) => x.ratio >= 4.5), [d.name, d.strength, d.price, d.note.c, va.c].map((x) => x.ratio).join(", "));
  check(`${label}: no horizontal scroll with the dropdown open`, await noHScroll(page));
  await page.screenshot({ path: path.join(shots, `dropdown-${label}.png`), fullPage: false });
  // a strength click still goes to /register
  await Promise.all([page.waitForNavigation({ waitUntil: "networkidle0" }), page.evaluate(() => [...document.querySelectorAll("[data-public-strength]")].find((a) => a.offsetParent !== null).click())]);
  check(`${label}: choosing a strength still goes to /register`, new URL(page.url()).pathname === "/register");
  await ctx.close();
}

// ---------- 3. View All overlay ----------
for (const [label, viewport] of [["desktop", { width: 1366, height: 860 }], ["phone", { width: 390, height: 844, isMobile: true, hasTouch: true }]]) {
  const { ctx, page } = await open(viewport);
  await page.goto(`${BASE}/about`, { waitUntil: "networkidle0" });
  if (label === "phone") { await page.click('button[aria-label="Toggle menu"]'); await sleep(400); }
  const box = await visibleBox(page);
  await (await box.evaluateHandle((el) => el.querySelector("input"))).focus(); await sleep(300);
  await page.evaluate(() => [...document.querySelectorAll("[data-view-all]")].find((b) => b.offsetParent !== null).click());
  await page.waitForSelector("[data-compound-list]", { visible: true });
  await installContrast(page);
  const o = await page.evaluate(() => {
    const dlg = document.querySelector("[data-compound-list] [role=dialog]"); const r = dlg.getBoundingClientRect(); const hdr = dlg.querySelector("[data-list-header]");
    const rows = [...dlg.querySelectorAll("[data-compound-row]")]; const first = rows[0];
    const cta = dlg.querySelector("[data-list-cta]"); const msg = dlg.querySelector("[data-list-register-text]"); const list = dlg.querySelector("[data-compound-rows]");
    return { rect: { l: r.left, r: r.right, t: r.top, b: r.bottom }, vw: innerWidth, vh: innerHeight,
      headerBg: window.__rgb(getComputedStyle(hdr).backgroundColor), title: { text: dlg.querySelector("#compound-list-title").innerText, c: window.__contrast(dlg.querySelector("#compound-list-title")) },
      close: window.__contrast(dlg.querySelector("[data-close-list]")), contentBg: window.__rgb(getComputedStyle(dlg).backgroundColor),
      name: window.__contrast(first.querySelector("[data-list-name]")), nameWeight: getComputedStyle(first.querySelector("[data-list-name]")).fontWeight,
      strength: window.__contrast(first.querySelector("[data-list-strength]")), price: window.__contrast(first.querySelector("[data-list-price]")), priceWeight: getComputedStyle(first.querySelector("[data-list-price]")).fontWeight,
      msg: { text: msg.innerText.replace(/\s+/g, " ").trim(), c: window.__contrast(msg) }, cta: { text: cta.innerText.trim(), c: window.__contrast(cta), href: cta.getAttribute("href") },
      names: rows.map((x) => x.querySelector("[data-list-name]").textContent), imgs: dlg.querySelectorAll("img").length,
      scrollable: list.scrollHeight > list.clientHeight, overflow: document.documentElement.scrollWidth > innerWidth + 1, focused: document.activeElement?.hasAttribute("data-close-list") };
  });
  check(`${label}: overlay title "VIEW ALL ${COUNT} COMPOUNDS & PRICES" on a navy header; white content`, o.title.text === `VIEW ALL ${COUNT} COMPOUNDS & PRICES` && o.headerBg === "#132544" && o.contentBg === "#ffffff", `${o.title.text} ${o.headerBg} ${o.contentBg}`);
  check(`${label}: all ${COUNT} compounds, alphabetical, no thumbnails`, JSON.stringify(o.names) === JSON.stringify(pubData.compounds.map((c) => c.name)) && o.imgs === 0, `${o.names.length} rows, ${o.imgs} images`);
  check(`${label}: names and strengths gray (not white), prices gold-ink, semibold`, o.name.fg === "#6a7075" && o.strength.fg === "#6a7075" && o.price.fg === "#82673b" && Number(o.priceWeight) >= 600, `${o.name.fg} ${o.strength.fg} ${o.price.fg} w${o.priceWeight}`);
  check(`${label}: prices are the highest-contrast text in each row`, o.price.ratio > o.name.ratio && o.price.ratio > o.strength.ratio, `${o.price.ratio} vs ${o.name.ratio}/${o.strength.ratio}`);
  check(`${label}: every overlay text ≥ 4.5:1`, [o.title.c, o.close, o.name, o.strength, o.price, o.msg.c, o.cta.c].every((x) => x.ratio >= 4.5), [o.title.c, o.close, o.name, o.strength, o.price, o.msg.c, o.cta.c].map((x) => x.ratio).join(", "));
  check(`${label}: registration message + CREATE YOUR FREE ACCOUNT → /register`, /can be viewed without an account/.test(o.msg.text) && /Registration is required for full product details, inventory availability and purchasing/.test(o.msg.text) && o.cta.text === "CREATE YOUR FREE ACCOUNT" && o.cta.href === "/register", o.cta.text);
  const centred = label === "desktop" ? Math.abs((o.rect.l + o.rect.r) / 2 - o.vw / 2) < 2 && Math.abs((o.rect.t + o.rect.b) / 2 - o.vh / 2) < 2 : o.rect.l >= 0 && o.rect.r <= o.vw;
  check(`${label}: ${label === "desktop" ? "centred" : "fits the screen"}, list scrolls, no horizontal scroll, focus on close`, centred && o.scrollable && !o.overflow && o.focused, JSON.stringify(o.rect));
  if (label === "desktop") {
    measure(`overlay title (brand gold on navy): ${o.title.c.fg} on ${o.title.c.bg} → ${o.title.c.ratio}:1`);
    measure(`overlay close × (white 70% on navy): ${o.close.fg} on ${o.close.bg} → ${o.close.ratio}:1`);
    measure(`overlay compound name (--muted, medium): ${o.name.fg} on ${o.name.bg} → ${o.name.ratio}:1`);
    measure(`overlay strength (--muted): ${o.strength.fg} on ${o.strength.bg} → ${o.strength.ratio}:1`);
    measure(`overlay price (--gold-ink, semibold): ${o.price.fg} on ${o.price.bg} → ${o.price.ratio}:1`);
    measure(`overlay registration text (--muted on --surface): ${o.msg.c.fg} on ${o.msg.c.bg} → ${o.msg.c.ratio}:1`);
    measure(`overlay CTA (black on brand gold): ${o.cta.c.fg} on ${o.cta.c.bg} → ${o.cta.c.ratio}:1`);
  }
  await page.screenshot({ path: path.join(shots, `view-all-${label}.png`) });
  await page.keyboard.press("Escape"); await sleep(200);
  check(`${label}: Escape closes the overlay`, !(await page.$("[data-compound-list]")));
  await (await (await visibleBox(page)).evaluateHandle((el) => el.querySelector("input"))).focus(); await sleep(200);
  await page.evaluate(() => [...document.querySelectorAll("[data-view-all]")].find((b) => b.offsetParent !== null).click());
  await page.waitForSelector("[data-list-cta]");
  await Promise.all([page.waitForNavigation({ waitUntil: "networkidle0" }), page.evaluate(() => document.querySelector("[data-list-cta]").click())]);
  check(`${label}: CREATE YOUR FREE ACCOUNT goes to /register`, new URL(page.url()).pathname === "/register");
  await ctx.close();
}

// ---------- 4. Coming Soon indicator ----------
const kpv = (await q("SELECT id FROM product_strengths WHERE sku = 'KPV-10MG'"))[0];
const before = (await q("SELECT availability_status, estimated_available_on FROM product_strengths WHERE id = $1", [kpv.id]))[0];
try {
  for (const [label, viewport] of [["desktop", { width: 1366, height: 860 }], ["phone", { width: 390, height: 844, isMobile: true, hasTouch: true }]]) {
    for (const date of ["2026-12-15", null]) {
      await q("UPDATE product_strengths SET availability_status = 'coming_soon', estimated_available_on = $2 WHERE id = $1", [kpv.id, date]);
      const { ctx, page } = await open(viewport, `demo-customer~s~${Date.now()}`);
      await page.goto(`${BASE}/shop/kpv`, { waitUntil: "networkidle0" });
      await installContrast(page);
      const b = await page.evaluate(() => {
        const el = document.querySelector("[data-status-badge]"); const cs = getComputedStyle(el); const wrap = el.closest("[data-coming-soon]");
        const btn = [...document.querySelectorAll("button")].find((x) => /coming soon/i.test(x.innerText) && x.disabled);
        return { borders: [cs.borderTopWidth, cs.borderRightWidth, cs.borderBottomWidth, cs.borderLeftWidth, cs.borderTopStyle], tint: cs.backgroundColor, color: window.__rgb(cs.color), c: window.__contrast(el),
          dot: Boolean(el.querySelector("span.rounded-full")), text: el.innerText.trim(), date: [...wrap.querySelectorAll("p")].map((p) => p.innerText).find((t) => /Estimated availability/.test(t)) ?? null,
          button: btn ? { text: btn.innerText.trim(), disabled: btn.disabled } : null, rect: el.getBoundingClientRect().toJSON() };
      });
      const tag = `${label}, ${date ? "with" : "without"} a date`;
      check(`Coming Soon (${tag}): no border; tint kept; gold-ink text; dot kept`, b.borders.slice(0, 4).every((w) => w === "0px") && b.tint !== "rgba(0, 0, 0, 0)" && b.color === "#82673b" && b.dot && b.text === "Coming Soon", JSON.stringify(b.borders));
      check(`Coming Soon (${tag}): text ≥ 4.5:1 on its tint`, b.c.ratio >= 4.5, `${b.c.fg} on ${b.c.bg} → ${b.c.ratio}:1`);
      check(`Coming Soon (${tag}): ${date ? "estimated date shown from the strength record" : "no date invented"}`, date ? /Estimated availability: December 15, 2026/.test(b.date ?? "") : b.date === null, b.date ?? "none");
      check(`Coming Soon (${tag}): the larger disabled Coming Soon button is unchanged`, b.button?.text.toUpperCase() === "COMING SOON" && b.button.disabled, JSON.stringify(b.button));
      if (label === "desktop" && date) measure(`Coming Soon badge text (--gold-ink on the gold 10% tint over the panel): ${b.c.fg} on ${b.c.bg} → ${b.c.ratio}:1`);
      await page.evaluate(() => document.querySelector("[data-status-badge]").scrollIntoView({ block: "center" }));
      await page.screenshot({ path: path.join(shots, `coming-soon-${label}-${date ? "with-date" : "no-date"}.png`) });
      await ctx.close();
    }
  }
} finally {
  await q("UPDATE product_strengths SET availability_status = $2, estimated_available_on = $3 WHERE id = $1", [kpv.id, before.availability_status, before.estimated_available_on]);
}

// ---------- 5. signed-in search untouched ----------
{
  const { ctx, page } = await open({ width: 1366, height: 860 }, `demo-customer~s~${Date.now()}`);
  await page.goto(`${BASE}/about`, { waitUntil: "networkidle0" });
  const si = await page.evaluate(() => { const i = document.querySelector("#catalog-search"); const f = i.closest("div.border"); const cs = getComputedStyle(f); return { placeholder: i.placeholder, bg: cs.backgroundColor, border: cs.borderTopColor, w: Math.round(f.getBoundingClientRect().width), publicBox: document.querySelectorAll("[data-public-search]").length }; });
  check("signed-in search unchanged: its own placeholder and styling (not the slate/gold field), same 204px slot", si.placeholder === "Search name or CAS #" && !/34, 50, 85/.test(si.bg) && si.w === 204 && si.publicBox === 0, JSON.stringify(si));
  await page.screenshot({ path: path.join(shots, "header-signed-in-1366.png"), clip: { x: 0, y: 0, width: 1366, height: 140 } });
  await ctx.close();
}

await browser.close().catch(() => {}); edge.kill(); await pool.end();
console.log("\nMEASUREMENTS\n" + M.map((l) => `  ${l}`).join("\n"));
console.log(`\n[V2-UI] ${pass} passed, ${fail} failed (${pass + fail} checks)${failures.length ? `\nFAILED: ${failures.join(" | ")}` : ""}`);
process.exit(fail ? 1 : 0);
