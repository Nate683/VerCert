// LOCAL ONLY. Browser tests (headless Edge via puppeteer-core) against http://localhost:3300 and the local test DB.
//  1. Stage 2 correction: Stock tab scrolls the opened SKU's panel into view (desktop + mobile, sticky header,
//     refresh, reduced motion, re-open) and does NOT scroll on unrelated interactions.
//  2. Stage 3 screens: Orders (detail + Zelle confirmation with reference), Reservations, Payments, Stock lots.
//  3. Checkout shows only offered methods and places a Zelle order.
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import pg from "pg";
import puppeteer from "puppeteer-core";
import { randomUUID } from "crypto";

const BASE = "http://localhost:3300";
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const here = path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Z]:)/, "$1");
const profile = path.join(here, "edge-profile-ui");
fs.rmSync(profile, { recursive: true, force: true });
const edge = spawn(EDGE, ["--headless=new", `--user-data-dir=${profile}`, "--remote-debugging-port=9334", "--no-first-run", "--disable-gpu", "about:blank"], { stdio: "ignore" });
const pool = new pg.Pool({ host: "127.0.0.1", port: 5491, user: "demo", password: "demo", database: "demo", max: 4 });
const q = async (t, p = []) => (await pool.query(t, p)).rows;

let pass = 0, fail = 0; const failures = [];
const check = (name, ok, detail = "") => { if (ok) pass++; else { fail++; failures.push(name); } console.log(`${ok ? "PASS" : "FAIL"}  [UI] ${name}${detail ? `  — ${detail}` : ""}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const enc = new TextEncoder();
async function sign(v) {
  const d = await crypto.subtle.digest("SHA-256", enc.encode("demo-session-secret"));
  const k = await crypto.subtle.importKey("raw", d, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return Buffer.from(await crypto.subtle.sign("HMAC", k, enc.encode(v))).toString("hex");
}
async function token(payload) { const s = `${payload}.${Date.now() + 3600_000}`; return `${s}.${await sign(s)}`; }

let browser;
for (let i = 0; i < 40 && !browser; i++) {
  try { browser = await puppeteer.connect({ browserURL: "http://127.0.0.1:9334" }); } catch { await sleep(250); }
}
if (!browser) throw new Error("Edge did not start");

async function pageAs(userPayload, viewport) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport(viewport);
  await ctx.setCookie(
    { name: "vericert_customer_session", value: await token(userPayload), domain: "localhost", path: "/" },
    { name: "vericert_age_ack", value: "1", domain: "localhost", path: "/" }
  );
  return { ctx, page };
}
// Waits until scrollY has held still for ~10 frames (the smooth scroll has ended).
const settle = (page) => page.evaluate(() => new Promise((res) => {
  let last = window.scrollY, still = 0, n = 0;
  const tick = () => { n++; if (Math.abs(window.scrollY - last) < 0.5) still++; else still = 0; last = window.scrollY; if (still >= 10 || n > 300) res(window.scrollY); else requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
}));
const panelTop = (page) => page.evaluate(() => document.querySelector("[data-sku-panel]")?.getBoundingClientRect().top ?? null);

// ---------- 1. Stock tab scrolling ----------
for (const [label, viewport] of [["desktop", { width: 1366, height: 860 }], ["mobile", { width: 390, height: 844, isMobile: true, hasTouch: true }]]) {
  const { ctx, page } = await pageAs(`demo-command~2fa~${Date.now()}`, viewport);
  await page.goto(`${BASE}/command?tab=stock`, { waitUntil: "networkidle2" });
  await page.waitForSelector("[data-stock-table]", { timeout: 30000 });
  // SKUs that have stock (so they have a lot to adjust), in page order; pick ones low in the list.
  const stocked = new Set((await q("SELECT s.sku FROM product_strengths s JOIN strength_inventory si ON si.strength_id = s.id WHERE si.physical_quantity > 0")).map((r) => r.sku));
  const skus = (await page.$$eval("[data-open-sku]", (b) => b.map((x) => x.getAttribute("data-open-sku")))).filter((s) => stocked.has(s));
  const target = skus[Math.floor(skus.length * 0.6)];
  await page.evaluate(() => window.scrollTo(0, 0));
  // Open a SKU low in the list: the panel (rendered below the table) must come into view at the top.
  await page.evaluate((s) => { const b = document.querySelector(`[data-open-sku="${s}"]`); b.scrollIntoView({ block: "center" }); }, target);
  await settle(page);
  await page.click(`[data-open-sku="${target}"]`);
  await page.waitForSelector("[data-sku-detail]");
  await settle(page);
  const top1 = await panelTop(page);
  check(`${label}: Open scrolls the SKU panel to the top of the viewport`, top1 !== null && top1 >= 0 && top1 <= 30, `panel top ${top1?.toFixed(1)}px`);
  const focused = await page.evaluate(() => document.activeElement?.hasAttribute("data-sku-panel"));
  check(`${label}: focus moves to the panel (keyboard / screen reader)`, focused === true);
  check(`${label}: ?strength= is set for refresh`, /strength=/.test(page.url()));

  // Unrelated interactions do not scroll. (The user first scrolls up to the search box, as a person would — typing
  // into an off-screen field makes the BROWSER bring it into view, which isn't this feature.)
  await page.evaluate(() => document.querySelector("input[aria-label='Search product or SKU']").scrollIntoView({ block: "center" }));
  await settle(page);
  const y0 = await page.evaluate(() => window.scrollY);
  await page.type("input[aria-label='Search product or SKU']", "zz");
  await sleep(300);
  const y1 = await page.evaluate(() => window.scrollY);
  check(`${label}: typing in search doesn't scroll`, Math.abs(y1 - y0) < 2, `${y0} → ${y1}`);
  await page.$eval("input[aria-label='Search product or SKU']", (el) => { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set; set.call(el, ""); el.dispatchEvent(new Event("input", { bubbles: true })); });
  await page.select("select[aria-label='Filter by stock level']", "zero");
  await sleep(300);
  check(`${label}: changing the filter doesn't scroll`, Math.abs((await page.evaluate(() => window.scrollY)) - y1) < 300, "panel may reflow, no programmatic scroll");
  await page.select("select[aria-label='Filter by stock level']", "all");
  await settle(page);
  // An adjustment (refused or recorded) must not scroll the page.
  await page.evaluate(() => document.querySelector("[data-adjust-form]").scrollIntoView({ block: "center" }));
  await settle(page);
  const ya = await page.evaluate(() => window.scrollY);
  await page.select("select[aria-label='Adjustment']", "stock_removed");
  await page.type("input[aria-label='Units']", "1");
  await page.click("[data-adjust-form] button[type='submit']");
  await page.waitForSelector("[data-adjust-message]", { timeout: 15000 });
  await sleep(400);
  const yb = await page.evaluate(() => window.scrollY);
  check(`${label}: submitting an adjustment doesn't scroll`, Math.abs(yb - ya) < 2, `${ya} → ${yb}`);

  // Re-open the same SKU after scrolling away: scrolls back.
  await page.evaluate(() => window.scrollTo(0, 0));
  await settle(page);
  await page.evaluate((s) => document.querySelector(`[data-open-sku="${s}"]`).scrollIntoView({ block: "center" }), target);
  await settle(page);
  await page.click(`[data-open-sku="${target}"]`);
  await settle(page);
  const top2 = await panelTop(page);
  check(`${label}: opening the same SKU again scrolls to it again`, top2 >= 0 && top2 <= 30, `${top2?.toFixed(1)}px`);

  // Refresh keeps the SKU and brings its panel into view.
  await page.reload({ waitUntil: "networkidle2" });
  await page.waitForSelector("[data-sku-detail]", { timeout: 30000 });
  await settle(page);
  const top3 = await panelTop(page);
  const keptSku = await page.$eval("[data-sku-detail] .font-mono", (el) => el.textContent);
  check(`${label}: after refresh the selected SKU is kept and scrolled into view`, keptSku.startsWith(target) && top3 >= 0 && top3 <= 30, `${top3?.toFixed(1)}px`);

  // A sticky header (none exists in the Executive Office today): the panel lands below it.
  await page.evaluate(() => {
    const h = document.createElement("div");
    h.id = "test-sticky"; h.style.cssText = "position:fixed;top:0;left:0;right:0;height:64px;background:#222;z-index:999";
    document.body.appendChild(h);
    window.scrollTo(0, 0);
  });
  await settle(page);
  const other = skus[Math.floor(skus.length * 0.8)];
  await page.evaluate((s) => document.querySelector(`[data-open-sku="${s}"]`).scrollIntoView({ block: "center" }), other);
  await settle(page);
  await page.click(`[data-open-sku="${other}"]`);
  await page.waitForSelector(`[data-sku-panel]`);
  await settle(page);
  const top4 = await panelTop(page);
  check(`${label}: with a 64px sticky header the panel lands just below it`, top4 >= 64 && top4 <= 64 + 30, `${top4?.toFixed(1)}px`);
  await page.evaluate(() => document.getElementById("test-sticky").remove());

  // Reduced motion: instant (no smooth animation).
  await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.evaluate((s) => document.querySelector(`[data-open-sku="${s}"]`).scrollIntoView({ block: "center" }), target);
  const yBefore = await page.evaluate(() => window.scrollY);
  await page.click(`[data-open-sku="${target}"]`);
  const yImmediate = await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(window.scrollY)))));
  await settle(page);
  const yFinal = await page.evaluate(() => window.scrollY);
  check(`${label}: with reduced motion the jump is immediate`, Math.abs(yImmediate - yFinal) < 2 && yFinal !== yBefore, `${yBefore} → ${yImmediate} / ${yFinal}`);
  await ctx.close();
}

// ---------- 2. Stage 3 Executive Office screens ----------
{
  const { ctx, page } = await pageAs(`demo-command~2fa~${Date.now()}`, { width: 1366, height: 900 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  // A Zelle order to confirm (created through the API as the customer).
  const s = (await q("SELECT s.id, s.sku, s.product_slug, s.label FROM product_strengths s WHERE s.sku = 'TB-4-10MG'"))[0];
  await page.goto(`${BASE}/command?tab=stock&strength=${s.id}`, { waitUntil: "networkidle2" });
  await page.waitForSelector("[data-lots-table]", { timeout: 30000 });
  check("Stock: lots table shows the quarantined reconciliation lot", await page.$eval("[data-lots-table]", (t) => /RECON-TB-4-10MG/.test(t.textContent) && /Quarantined/i.test(t.textContent)));
  await page.click("[data-receive-lot]");
  await page.type("[data-lot-form='receive'] input[aria-label='Units']", "6");
  await page.type("[data-lot-form='receive'] input[aria-label='Manufacturer batch / lot']", "MFR-UI-1");
  await page.click("[data-lot-form='receive'] button[type='submit']");
  await page.waitForSelector("[data-lot-message]", { timeout: 15000 });
  const recvMsg = await page.$eval("[data-lot-message]", (el) => el.textContent);
  check("Stock: receive a lot in the browser", /Received into new lot/.test(recvMsg), recvMsg);
  const newLot = recvMsg.match(/LOT-\d+/)[0];
  await page.waitForSelector(`[data-lot="${newLot}"]`, { timeout: 15000 });
  await page.click(`[data-manage-lot="${newLot}"]`);
  await page.select("[data-lot-form='manage'] select[aria-label='Release status']", "approved");
  await page.waitForFunction(() => /Justification/.test(document.querySelector("[data-lot-form='manage']")?.textContent ?? ""));
  check("Stock: approving an untested lot asks for a justification", true);
  await page.select("[data-lot-form='manage'] select[aria-label='Testing status']", "passed");
  const blocked = await page.$eval("[data-lot-form='manage'] button[type='submit']", (b) => b.disabled);
  check("D4 (browser): approving without a VeriCert lot number is blocked, with the reason shown", blocked && Boolean(await page.$("[data-needs-vericert]")));
  await page.type("[data-lot-form='manage'] input[aria-label='VeriCert lot number (certificate)']", "VC-UI-0001");
  await page.waitForFunction(() => !document.querySelector("[data-lot-form='manage'] button[type='submit']").disabled, { timeout: 5000 });
  await page.click("[data-lot-form='manage'] button[type='submit']");
  await page.waitForFunction(() => /Saved/.test(document.querySelector("[data-lot-message]")?.textContent ?? ""), { timeout: 15000 });
  await page.waitForFunction((c) => document.querySelector(`[data-lot="${c}"]`)?.getAttribute("data-eligible") === "1", { timeout: 15000 }, newLot);
  check("Stock: lot received and approved in the browser → sellable", true);

  const cust = `vericert_customer_session=${await token(`demo-customer2~s~${Date.now()}`)}`;
  await fetch(`${BASE}/api/executive/payment-methods`, { method: "PUT", headers: { "Content-Type": "application/json", Cookie: `vericert_customer_session=${await token(`demo-command~2fa~${Date.now()}`)}` },
    body: JSON.stringify({ enabled: { zelle: true, bank_transfer: true }, reservationMinutes: {}, achFulfillment: "after_settlement" }) });
  const created = await fetch(`${BASE}/api/orders`, { method: "POST", headers: { "Content-Type": "application/json", Cookie: cust }, body: JSON.stringify({
    customer: { firstName: "Cal", lastName: "Test", email: "buyer2@example.invalid", address: "2 St", city: "Dallas", state: "TX", postalCode: "75001", country: "US" },
    items: [{ slug: s.product_slug, sizeLabel: s.label, strengthId: s.id, quantity: 2 }], paymentMethod: "zelle", researchAttestation: true, idempotencyKey: randomUUID() }) }).then((r) => r.json());
  const order = (await q("SELECT id, reference, total FROM orders WHERE reference = $1", [created.reference]))[0];

  await page.goto(`${BASE}/command?tab=orders`, { waitUntil: "networkidle2" });
  await page.waitForSelector("[data-orders-table]");
  check("Orders: no Mark Paid / Bulk Mark Paid button anywhere", !(await page.evaluate(() => /mark paid/i.test(document.body.innerText))));
  await page.type("input[aria-label='Search orders']", order.reference);
  await page.waitForFunction((r) => document.querySelectorAll("[data-order-row]").length === 1 && document.querySelector(`[data-order-row="${r}"]`), { timeout: 15000 }, order.reference);
  check("Orders: search by order number narrows to that order", true);
  await page.click(`[data-open-order="${order.reference}"]`);
  await page.waitForSelector("[data-order-detail]");
  check("Order detail: customer, payment record, lines and history shown",
    await page.$eval("[data-order-detail]", (d) => /Customer and shipping/i.test(d.innerText) && Boolean(d.querySelector("[data-payment-record]")) && /buyer2@example\.invalid/i.test(d.innerText)
      && Boolean(d.querySelector("[data-order-lines]")) && Boolean(d.querySelector("[data-order-history]"))));
  await page.click("[data-action='confirm']");
  await page.waitForSelector("[data-form='confirm']");
  const disabledWithoutRef = await page.$eval("[data-form='confirm'] button[type='submit']", (b) => b.disabled);
  check("Confirm payment: button disabled until a reference is entered and the attestation ticked", disabledWithoutRef);
  await page.type("[data-form='confirm'] input[aria-label='Confirmation reference']", "ZEL-UI-4242");
  await page.click("[data-form='confirm'] input[aria-label='I have seen this payment']");
  await page.click("[data-form='confirm'] button[type='submit']");
  await page.waitForFunction(() => /Payment confirmed/.test(document.querySelector("[data-order-message]")?.textContent ?? ""), { timeout: 15000 });
  const row = (await q("SELECT payment_status, payment_reference, payment_confirmed_by, fulfillment_status FROM orders WHERE id = $1", [order.id]))[0];
  check("Confirm payment (browser): stored with reference and administrator; stock allocated",
    row.payment_status === "confirmed" && row.payment_reference === "ZEL-UI-4242" && row.payment_confirmed_by === "admin:command@example.invalid" && row.fulfillment_status === "allocated");
  await page.waitForSelector("[data-allocations] [data-allocation='committed']", { timeout: 15000 });
  check("Order detail: the lot the order was filled from is shown", await page.$eval("[data-allocations]", (d) => /LOT-/.test(d.innerText)));

  await page.goto(`${BASE}/command?tab=reservations`, { waitUntil: "networkidle2" });
  await page.waitForSelector("[data-reservations-panel] [data-heartbeat]", { timeout: 15000 });
  check("Reservations tab renders with the sweep heartbeat", true);
  await page.goto(`${BASE}/command?tab=payments`, { waitUntil: "networkidle2" });
  await page.waitForSelector("[data-payment-methods]", { timeout: 15000 });
  const offeredRows = await page.$$eval("[data-method][data-offered='1']", (r) => r.map((x) => x.getAttribute("data-method")));
  check("Payments tab: only Zelle and bank transfer offered; warning that no provider is connected",
    offeredRows.sort().join(",") === "bank_transfer,zelle" && (await page.evaluate(() => /No payment provider is connected/.test(document.body.innerText))), offeredRows.join(","));
  check("no client-side errors on the executive pages", errors.length === 0, errors.slice(0, 3).join(" | "));
  await ctx.close();
  const office = await pageAs(`demo-office~2fa~${Date.now()}`, { width: 1366, height: 900 });
  await office.page.goto(`${BASE}/office?tab=orders`, { waitUntil: "networkidle2" });
  await office.page.waitForSelector("[data-orders-table]", { timeout: 30000 });
  await office.page.goto(`${BASE}/office?tab=reservations`, { waitUntil: "networkidle2" });
  await office.page.waitForSelector("[data-reservations-panel]", { timeout: 30000 });
  check("/office: Orders and Reservations tabs work for the office account", true);
  await office.ctx.close();
}

// ---------- 3. Checkout ----------
// The API suite that runs first places many orders as this customer; reset the (unchanged) 20/hour order limit.
await q("DELETE FROM rate_limits");
for (const [label, viewport] of [["desktop", { width: 1280, height: 900 }], ["mobile", { width: 390, height: 844, isMobile: true, hasTouch: true }]]) {
  const { ctx, page } = await pageAs(`demo-customer~s~${Date.now()}`, viewport);
  const s = (await q("SELECT s.id, s.sku, s.product_slug, s.label, p.name FROM product_strengths s JOIN products p ON p.slug = s.product_slug WHERE s.sku = 'TB-4-10MG'"))[0];
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.evaluate((item) => localStorage.setItem("vericert-cart", JSON.stringify([item])),
    { slug: s.product_slug, name: s.name, sizeLabel: s.label, strengthId: s.id, sku: s.sku, priceUsd: 1, quantity: 1 });
  await page.goto(`${BASE}/checkout`, { waitUntil: "networkidle2" });
  await page.waitForSelector("input[name='paymentMethod']", { timeout: 30000 });
  const methods = await page.$$eval("input[name='paymentMethod']", (r) => r.map((x) => x.value).sort());
  check(`checkout ${label}: only the offered methods are shown (bank transfer, Zelle)`, methods.join(",") === "bank_transfer,zelle", methods.join(","));
  const noCardFields = await page.evaluate(() => !document.querySelector("input[autocomplete^='cc-'], input[name*='card' i], input[name*='routing' i]"));
  check(`checkout ${label}: no card or bank-account fields exist`, noCardFields);
  await page.click("input[name='paymentMethod'][value='zelle']");
  for (const [n, v] of [["firstName", "Bea"], ["lastName", "Test"], ["address", "1 Test St"], ["city", "Austin"], ["state", "TX"], ["postalCode", "73301"], ["country", "US"]]) {
    const el = await page.$(`input[name='${n}']`);
    if (el) { await el.click({ clickCount: 3 }); await el.type(v); }
  }
  const editAddr = await page.$("button[data-edit-address]");
  if (editAddr) await editAddr.click();
  await page.$$eval("input[type='checkbox']", (boxes) => boxes.forEach((b) => { if (!b.checked && /I certify/i.test(b.closest("label")?.textContent ?? "")) b.click(); }));
  const before = Number((await q("SELECT count(*)::int AS n FROM orders"))[0].n);
  // Double-click Place Order: one order.
  const submit = (await page.$$("button[type='submit']")).find(Boolean) && await page.evaluateHandle(() => [...document.querySelectorAll("button[type='submit']")].find((b) => /Place Order/i.test(b.textContent)));
  await Promise.all([submit.click(), submit.click().catch(() => {})]);
  await page.waitForFunction(() => location.pathname.startsWith("/order/"), { timeout: 30000 }).catch(() => {});
  const after = Number((await q("SELECT count(*)::int AS n FROM orders"))[0].n);
  const url = page.url();
  const alerts = /\/order\//.test(url) ? [] : await page.$$eval("[role='alert']", (els) => els.map((e) => e.textContent.trim()).filter(Boolean));
  check(`checkout ${label}: Zelle order placed, one order despite a double click`, /\/order\/VC-/.test(url) && after === before + 1, `${url} orders +${after - before} ${alerts.join(" / ")}`);
  const txt = await page.evaluate(() => document.body.innerText);
  check(`checkout ${label}: order page shows Zelle instructions, not bank details`, /LOCAL TEST RECIPIENT/.test(txt) && !/Routing Number/i.test(txt));
  await ctx.close();
}

console.log(`\n[UI] ${pass} passed, ${fail} failed (${pass + fail} checks)${failures.length ? `\nFAILED: ${failures.join(" | ")}` : ""}`);
await browser.close().catch(() => {});
edge.kill();
await pool.end();
process.exit(fail ? 1 : 0);
