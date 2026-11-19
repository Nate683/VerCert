// LOCAL ONLY. Stage 2 regression checks, REBUILT for Stage 3 (the original Stage 2 scripts were lost with a scratch
// folder). Written from the Stage 2 report's description of what was tested, adapted to lot-scoped adjustments. Not a
// restoration of the original 43 checks — a new suite covering the same behaviours.
// Runs against the local production build (:3300, simulation off) and the local test Postgres.
//   API/DB: adjustments, the invalid inputs, duplicate submission, concurrency (+20 / floor), stale count, movement
//           logging (chain, actor/reason, append-only), thresholds & levels, stock never changes status,
//           deactivate/reactivate/rename keep stock, authorization, no admin data in public pages
//   Browser: Stock tab search & filters & product totals, B1 duplicate-strength warning, B2 ?strength= rewrite,
//           B3 refresh restores the editor + unsaved-change prompts, B4 Coming Soon badge contrast (measured)
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import pg from "pg";
import puppeteer from "puppeteer-core";
import { randomUUID } from "crypto";

const BASE = "http://localhost:3300";
const pool = new pg.Pool({ host: "127.0.0.1", port: 5491, user: "demo", password: "demo", database: "demo", max: 30 });
const q = async (t, p = []) => (await pool.query(t, p)).rows;
const one = async (t, p) => (await q(t, p))[0];
let pass = 0, fail = 0; const failures = [];
const check = (name, ok, detail = "") => { if (ok) pass++; else { fail++; failures.push(name); } console.log(`${ok ? "PASS" : "FAIL"}  [S2] ${name}${detail ? `  — ${detail}` : ""}`); };
const enc = new TextEncoder();
async function sign(v) {
  const d = await crypto.subtle.digest("SHA-256", enc.encode("demo-session-secret"));
  const k = await crypto.subtle.importKey("raw", d, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return Buffer.from(await crypto.subtle.sign("HMAC", k, enc.encode(v))).toString("hex");
}
async function token(p) { const s = `${p}.${Date.now() + 3600_000}`; return `${s}.${await sign(s)}`; }
const COMMAND = `vericert_customer_session=${await token(`demo-command~2fa~${Date.now()}`)}`;
const BUYER = `vericert_customer_session=${await token(`demo-customer~s~${Date.now()}`)}`;
async function api(p, { method = "GET", body, cookie } = {}) {
  const res = await fetch(BASE + p, { method, redirect: "manual", headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text(); let data; try { data = JSON.parse(text); } catch { data = { raw: text.slice(0, 200) }; }
  return { status: res.status, data };
}
const strength = (sku) => one("SELECT s.id, s.sku, s.product_slug, s.label FROM product_strengths s WHERE s.sku = $1", [sku]);
const detail = async (id) => (await api(`/api/executive/inventory/${id}`, { cookie: COMMAND })).data;
const adjust = (id, body) => api(`/api/executive/inventory/${id}/adjustments`, { method: "POST", cookie: COMMAND, body: { idempotencyKey: randomUUID(), ...body } });
const movementCount = async (id) => Number((await one("SELECT count(*)::int AS n FROM inventory_movements WHERE strength_id = $1", [id])).n);

// ---------------- API / database ----------------
const A = await strength("SELANK-11MG");
const recon = (await detail(A.id)).lots.find((l) => l.kind === "reconciliation");
{
  const before = (await detail(A.id)).row;
  const add = await adjust(A.id, { lotId: recon.id, type: "stock_received", quantity: 6, reason: "Returned to stock" });
  const rem = await adjust(A.id, { lotId: recon.id, type: "stock_removed", quantity: 2, reason: "Damaged" });
  const v = (await detail(A.id)).lots.find((l) => l.id === recon.id).version;
  const cnt = await adjust(A.id, { lotId: recon.id, type: "count_correction", quantity: 40, reason: "Physical count", expectedVersion: v });
  const after = (await detail(A.id)).row;
  check("adjustments: add +6, remove −2, count to 40 — each recorded, SKU follows the lot", add.status === 200 && rem.status === 200 && cnt.status === 200 && after.physical === 40
    && add.data.movement.resulting === before.physical + 6 && rem.data.movement.resulting === before.physical + 4, `${before.physical} → ${after.physical}`);
  check("adjustments: the response carries the recorded movement and the new stock", add.data.movement?.type === "stock_received" && typeof add.data.row?.physical === "number");
}
{
  const invalid = [
    ["fractional units", { type: "stock_received", quantity: 1.5, reason: "Returned to stock" }],
    ["negative units", { type: "stock_received", quantity: -3, reason: "Returned to stock" }],
    ["zero units to add", { type: "stock_received", quantity: 0, reason: "Returned to stock" }],
    ["zero units to remove", { type: "stock_removed", quantity: 0, reason: "Damaged" }],
    ["unknown adjustment type", { type: "teleport", quantity: 1, reason: "Damaged" }],
    ["reason not in the list", { type: "stock_removed", quantity: 1, reason: "Because" }],
    ["'Other' without a note", { type: "stock_removed", quantity: 1, reason: "Other" }],
    ["count correction without the version read", { type: "count_correction", quantity: 5, reason: "Physical count" }],
    ["absurd quantity", { type: "stock_received", quantity: 5_000_000, reason: "Returned to stock" }],
    ["note too long", { type: "stock_received", quantity: 1, reason: "Other", note: "x".repeat(501) }],
    ["no lot", { type: "stock_received", quantity: 1, reason: "Returned to stock", lotId: "" }],
    ["no idempotency key", { type: "stock_received", quantity: 1, reason: "Returned to stock", idempotencyKey: "" }],
  ];
  const n0 = await movementCount(A.id);
  let ok = 0;
  for (const [label, body] of invalid) {
    const r = await adjust(A.id, { lotId: recon.id, ...body });
    if (r.status === 400) ok++; else console.log(`      (accepted: ${label} → ${r.status})`);
  }
  check(`validation: all ${invalid.length} invalid adjustments refused (400)`, ok === invalid.length, `${ok}/${invalid.length}`);
  check("validation: nothing was recorded by any of them", (await movementCount(A.id)) === n0);
  const big = await adjust(A.id, { lotId: recon.id, type: "stock_removed", quantity: 999, reason: "Damaged" });
  check("validation: removing more than is available → 409, nothing changed", big.status === 409 && (await movementCount(A.id)) === n0);
}
{
  const key = randomUUID();
  const n0 = await movementCount(A.id);
  const a = await adjust(A.id, { lotId: recon.id, type: "stock_received", quantity: 1, reason: "Returned to stock", idempotencyKey: key });
  const b = await adjust(A.id, { lotId: recon.id, type: "stock_received", quantity: 1, reason: "Returned to stock", idempotencyKey: key });
  check("duplicate submission: the same adjustment sent twice is recorded once", a.data.movement.id === b.data.movement.id && (await movementCount(A.id)) === n0 + 1);
}
{
  // concurrency on a real lot: 20 simultaneous +1, then 25 simultaneous −1 against 20 available
  const r = await api(`/api/executive/inventory/${A.id}/lots`, { method: "POST", cookie: COMMAND, body: { quantity: 1, idempotencyKey: randomUUID() } });
  const lotId = r.data.result.lot_id;
  const before = (await detail(A.id)).row.physical;
  const adds = await Promise.all(Array.from({ length: 20 }, () => adjust(A.id, { lotId, type: "stock_received", quantity: 1, reason: "Returned to stock" })));
  const mid = (await detail(A.id)).lots.find((l) => l.id === lotId).physical;
  check("concurrency: 20 simultaneous +1 adjustments all land (+20 exactly)", adds.every((x) => x.status === 200) && mid === 21 && (await detail(A.id)).row.physical === before + 20);
  const rems = await Promise.all(Array.from({ length: 25 }, () => adjust(A.id, { lotId, type: "stock_removed", quantity: 1, reason: "Damaged" })));
  const end = (await detail(A.id)).lots.find((l) => l.id === lotId).physical;
  check("concurrency: 25 simultaneous −1 against 21 → exactly 21 succeed, the rest 409, floor at 0", rems.filter((x) => x.status === 200).length === 21 && rems.filter((x) => x.status === 409).length === 4 && end === 0);
}
{
  const lot = (await detail(A.id)).lots.find((l) => l.id === recon.id);
  const stale = await adjust(A.id, { lotId: recon.id, type: "count_correction", quantity: 10, reason: "Physical count", expectedVersion: lot.version - 1 });
  check("stale count: a correction against an outdated read → 409 stale, nothing changed", stale.status === 409 && stale.data.code === "stale" && (await detail(A.id)).lots.find((l) => l.id === recon.id).physical === lot.physical);
}
{
  const ms = await q("SELECT * FROM inventory_movements WHERE strength_id = $1 ORDER BY created_at, id", [A.id]);
  let chained = true;
  for (let i = 1; i < ms.length; i++) if (Number(ms[i].previous_quantity) !== Number(ms[i - 1].resulting_quantity)) chained = false;
  check(`movement history: ${ms.length} movements form an unbroken chain (each 'before' = the previous 'after')`, chained);
  check("movement history: every movement has a type, reason, actor and timestamp", ms.every((m) => m.movement_type && m.reason?.trim() && m.actor && m.created_at));
  check("movement history: the last movement matches the current SKU total", Number(ms.at(-1).resulting_quantity) === (await detail(A.id)).row.physical);
  let upd = false, del = false;
  try { await q("UPDATE inventory_movements SET quantity_change = quantity_change WHERE id = $1", [ms[0].id]); } catch { upd = true; }
  try { await q("DELETE FROM inventory_movements WHERE id = $1", [ms[0].id]); } catch { del = true; }
  check("movement history: append-only (UPDATE and DELETE rejected by the database)", upd && del);
  const api1 = (await detail(A.id)).movements;
  check("movement history API: newest first, with lot code", api1.every((m, i) => i === 0 || api1[i - 1].createdAt >= m.createdAt) && api1.some((m) => m.lotCode));
}
{
  const E = await strength("EPITHALON-10MG");
  const r = await api(`/api/executive/inventory/${E.id}/lots`, { method: "POST", cookie: COMMAND, body: { quantity: 6, vericertLotNumber: "VC-EPI-1", idempotencyKey: randomUUID() } });
  const lotId = r.data.result.lot_id;
  await api(`/api/executive/lots/${lotId}`, { method: "PATCH", cookie: COMMAND, body: { testingStatus: "passed", releaseStatus: "approved", idempotencyKey: randomUUID() } });
  const th = await api(`/api/executive/inventory/${E.id}/threshold`, { method: "PUT", cookie: COMMAND, body: { threshold: 6, idempotencyKey: randomUUID() } });
  const level = async () => (await detail(E.id)).row.level;
  const l1 = await level();
  await adjust(E.id, { lotId, type: "stock_received", quantity: 1, reason: "Returned to stock" });
  const l2 = await level();
  const lot = (await detail(E.id)).lots.find((l) => l.id === lotId);
  await adjust(E.id, { lotId, type: "count_correction", quantity: 0, reason: "Physical count", expectedVersion: lot.version });
  const l3 = await level();
  const mv = (await detail(E.id)).movements.find((m) => m.type === "threshold_changed");
  check("thresholds: saved and recorded ('Low-stock threshold 10 → 6')", th.status === 200 && /→ 6/.test(mv?.reason ?? ""));
  check("levels: 6 sellable at threshold 6 → low; 7 → healthy; 0 → zero", l1 === "low" && l2 === "healthy" && l3 === "zero", `${l1}, ${l2}, ${l3}`);
  const status = (await one("SELECT availability_status FROM product_strengths WHERE id = $1", [E.id])).availability_status;
  check("stock never changes a strength's shop status (still In Stock at 0 units)", status === "in_stock");
}
{
  // deactivate / reactivate / rename keep stock and history (a two-strength product: one stays on sale)
  const V = await strength("VC3R-10MG");
  const P = (await api("/api/executive/products", { cookie: COMMAND })).data.products.find((p) => p.slug === V.product_slug);
  const sizes = P.sizes.map((s) => ({ id: s.id, label: s.label, priceUsd: s.priceUsd ?? null }));
  const s0 = (await detail(V.id)).row, n0 = await movementCount(V.id);
  const off = await api(`/api/executive/products/${V.product_slug}`, { method: "PATCH", cookie: COMMAND, body: { sizes: sizes.map((s) => (s.id === V.id ? { ...s, active: false } : s)) } });
  const s1 = (await detail(V.id)).row;
  const on = await api(`/api/executive/products/${V.product_slug}`, { method: "PATCH", cookie: COMMAND, body: { sizes: sizes.map((s) => (s.id === V.id ? { ...s, active: true, label: "10 mg" } : s)) } });
  const s2 = (await detail(V.id)).row;
  check("deactivate / reactivate / rename: stock, lots and history unchanged; id and SKU kept",
    off.status === 200 && on.status === 200 && !s1.strengthActive && s2.strengthActive && s1.physical === s0.physical && s2.physical === s0.physical && s2.sku === s0.sku && (await movementCount(V.id)) === n0 && s2.label === "10 mg",
    `${off.status}/${on.status} ${JSON.stringify(off.data).slice(0, 80)}`);
  await api(`/api/executive/products/${V.product_slug}`, { method: "PATCH", cookie: COMMAND, body: { sizes } });
}
{
  const eps = [["GET", "/api/executive/inventory"], ["GET", `/api/executive/inventory/${A.id}`], ["POST", `/api/executive/inventory/${A.id}/adjustments`], ["PUT", `/api/executive/inventory/${A.id}/threshold`]];
  let ok = 0;
  for (const [m, p] of eps) {
    const a = await api(p, { method: m, body: m === "GET" ? undefined : {} });
    const b = await api(p, { method: m, body: m === "GET" ? undefined : {}, cookie: BUYER });
    if (a.status === 401 && b.status === 401) ok++;
  }
  check("authorization: Stock endpoints refuse signed-out and customer requests", ok === eps.length, `${ok}/${eps.length}`);
  const page = await (await fetch(`${BASE}/shop/selank`, { headers: { Cookie: `${BUYER}; vericert_age_ack=1` } })).text();
  check("no admin data in public pages (no physical / reserved / threshold / lot codes / cost)", !/physical_quantity|reserved_quantity|low_stock_threshold|"physical"|"reserved"|"threshold"|RECON-|LOT-\d|costUsd/.test(page));
}

// ---------------- Browser ----------------
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const here = path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Z]:)/, "$1");
const profile = path.join(here, "edge-profile-s2");
fs.rmSync(profile, { recursive: true, force: true });
const edge = spawn(EDGE, ["--headless=new", `--user-data-dir=${profile}`, "--remote-debugging-port=9336", "--no-first-run", "--disable-gpu", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let browser;
for (let i = 0; i < 40 && !browser; i++) { try { browser = await puppeteer.connect({ browserURL: "http://127.0.0.1:9336" }); } catch { await sleep(250); } }
async function pageAs(payload, viewport = { width: 1366, height: 900 }) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport(viewport);
  await ctx.setCookie({ name: "vericert_customer_session", value: await token(payload), domain: "localhost", path: "/" }, { name: "vericert_age_ack", value: "1", domain: "localhost", path: "/" });
  return { ctx, page };
}
{
  const { ctx, page } = await pageAs(`demo-command~2fa~${Date.now()}`);
  await page.goto(`${BASE}/command?tab=stock`, { waitUntil: "networkidle2" });
  await page.waitForSelector("[data-stock-table]", { timeout: 30000 });
  const rows = await page.$$eval("[data-stock-row]", (r) => r.length);
  const setSearch = async (v) => {
    await page.$eval("input[aria-label='Search product or SKU']", (el, val) => { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set; set.call(el, val); el.dispatchEvent(new Event("input", { bubbles: true })); }, v);
    await sleep(250);
  };
  await setSearch("KPV-10MG");
  const bySku = await page.$$eval("[data-stock-row] td:nth-child(2)", (c) => c.map((x) => x.textContent.trim()));
  check("Stock search by SKU narrows to that SKU", bySku.length === 1 && bySku[0] === "KPV-10MG", bySku.join(","));
  await setSearch("semax");
  const byName = await page.$$eval("[data-stock-product]", (g) => g.map((x) => x.getAttribute("data-stock-product")));
  check("Stock search by product name: every product shown matches, including blends that contain it", byName.length >= 1 && byName.includes("semax") && byName.every((s) => s.includes("semax")), byName.join(","));
  await setSearch("");
  check("clearing the search shows every SKU again", (await page.$$eval("[data-stock-row]", (r) => r.length)) === rows);
  const api0 = (await api("/api/executive/inventory", { cookie: COMMAND })).data.rows;
  for (const lvl of ["zero", "low", "healthy"]) {
    await page.select("select[aria-label='Filter by stock level']", lvl);
    await sleep(250);
    const shown = await page.$$eval("[data-stock-row]", (r) => r.map((x) => x.querySelector("[data-level]")?.getAttribute("data-level")));
    const expected = api0.filter((r) => r.strengthActive && r.level === lvl).length;
    check(`Stock filter '${lvl}': shows exactly the ${expected} active SKU(s) at that level`, shown.length === expected && shown.every((l) => l === lvl), `${shown.length}`);
  }
  await page.select("select[aria-label='Filter by stock level']", "deactivated");
  await sleep(250);
  const deact = await page.$$eval("[data-stock-row]", (r) => r.length);
  check("Stock filter 'deactivated': shows the deactivated strengths only", deact === api0.filter((r) => !r.strengthActive).length && deact >= 1, `${deact}`);
  await page.select("select[aria-label='Filter by stock level']", "all");
  await sleep(250);
  const totalsOk = await page.$$eval("[data-stock-product]", (groups) => groups.every((g) => {
    const rows = [...g.querySelectorAll("[data-stock-row]")].filter((r) => !r.textContent.includes("deactivated"));
    const sum = rows.reduce((a, r) => a + Number(r.querySelectorAll("td")[3].textContent), 0);
    return Number(g.querySelector("[data-total='physical']").textContent) === sum;
  }));
  check("product totals = the sum of their active strengths' physical counts", totalsOk);

  // B1 immediate duplicate warning; B3 editor restore + unsaved-change prompts
  await page.goto(`${BASE}/command?tab=products&edit=kpv`, { waitUntil: "networkidle2" });
  await page.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => /\+ Add Strength/i.test(b.textContent)), { timeout: 30000 });
  check("B3: ?edit= reopens the product editor after a refresh", /edit=kpv/.test(page.url()) && (await page.evaluate(() => Boolean(document.querySelector("form")))));
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => /\+ Add Strength/i.test(b.textContent)).click());
  await page.waitForSelector("input[aria-label='Strength designation']", { timeout: 10000 });
  const inputs = await page.$$("input[aria-label='Strength designation']");
  await inputs.at(-1).type("10 MG");
  await sleep(150);
  check("B1: typing a duplicate strength (case/space) shows the warning immediately, before saving", Boolean(await page.$("[data-duplicate-warning]")));
  let dialogs = [];
  page.on("dialog", async (d) => { dialogs.push(`${d.type()}:${d.message()}`); await d.dismiss(); });
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => /^Cancel$/i.test(b.textContent.trim()))?.click());
  await sleep(300);
  check("B3: Cancel with unsaved changes asks first; dismissing keeps the editor open", dialogs.some((d) => /^confirm:Discard your unsaved changes/.test(d)) && /edit=kpv/.test(page.url()));
  dialogs = [];
  page.removeAllListeners("dialog");
  page.on("dialog", async (d) => { dialogs.push(d.type()); await d.accept(); });
  await page.reload({ waitUntil: "networkidle2" }).catch(() => {});
  check("B3: reloading with unsaved changes triggers the leave-page prompt", dialogs.includes("beforeunload"));
  await ctx.close();
}
{
  const { ctx, page } = await pageAs(`demo-customer~s~${Date.now()}`);
  await page.goto(`${BASE}/shop/kpv?strength=${encodeURIComponent("10 MG")}`, { waitUntil: "networkidle2" });
  const hist = await page.evaluate(() => history.length);
  const u = new URL(page.url());
  check("B2: a non-canonical ?strength= is rewritten in place to the strength shown", u.searchParams.get("strength") !== "10 MG" && Boolean(u.searchParams.get("strength")), u.search);
  await sleep(300);
  check("B2: …without a reload or a new history entry", (await page.evaluate(() => history.length)) === hist);
  // B4: Coming Soon badge contrast
  const S = await strength("KPV-10MG");
  await q("UPDATE product_strengths SET availability_status = 'coming_soon' WHERE id = $1", [S.id]);
  await page.goto(`${BASE}/shop/kpv`, { waitUntil: "networkidle2" });
  const ratio = await page.$eval("[data-status-badge]", (el) => {
    // Any CSS colour (the gold tint is reported as oklab(... / 0.1)) → sRGB + alpha, converted by the browser itself.
    const cv = document.createElement("canvas"); cv.width = cv.height = 1;
    const cx = cv.getContext("2d", { willReadFrequently: true });
    const parse = (c) => { cx.clearRect(0, 0, 1, 1); cx.fillStyle = "rgba(0,0,0,0)"; cx.fillStyle = c; cx.fillRect(0, 0, 1, 1); const d = cx.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255]; };
    const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
    let bg = [255, 255, 255];
    const chain = []; for (let n = el; n; n = n.parentElement) chain.unshift(n);
    for (const n of chain) { const c = parse(getComputedStyle(n).backgroundColor); const a = c.length > 3 ? c[3] : 1; if (a > 0) bg = bg.map((v, i) => v * (1 - a) + c[i] * a); }
    const fg = parse(getComputedStyle(el).color).slice(0, 3);
    const [L1, L2] = [lum(fg), lum(bg)].sort((a, b) => b - a);
    return (L1 + 0.05) / (L2 + 0.05);
  });
  await q("UPDATE product_strengths SET availability_status = 'in_stock' WHERE id = $1", [S.id]);
  check("B4: Coming Soon badge text meets WCAG AA (≥ 4.5:1, measured on its tinted background)", ratio >= 4.5, `${ratio.toFixed(2)}:1`);
  await ctx.close();
}
await browser.close().catch(() => {});
edge.kill();
console.log(`\n[S2] ${pass} passed, ${fail} failed (${pass + fail} checks)${failures.length ? `\nFAILED: ${failures.join(" | ")}` : ""}`);
await pool.end();
process.exit(fail ? 1 : 0);
