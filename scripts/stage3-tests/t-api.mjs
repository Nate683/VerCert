// LOCAL ONLY. Stage 3 API tests against the locally running production build (http://localhost:3300) and the local
// test Postgres (127.0.0.1:5491). Sessions are minted with the local test SESSION_SECRET. No external host is called.
//   PART=A  — server started WITHOUT payment simulation (refusals, Zelle, gates, admin, lots, search, cron)
//   PART=B  — server started WITH PAYMENT_SIMULATION=local-test-only (provider-verified methods, simulated events)
import pg from "pg";
import { randomUUID } from "crypto";
import fsMod from "fs";
globalThis.__fs = fsMod;

const BASE = "http://localhost:3300";
const PART = process.env.PART ?? "A";
const pool = new pg.Pool({ host: "127.0.0.1", port: 5491, user: "demo", password: "demo", database: "demo", max: 10 });
const q = async (t, p = []) => (await pool.query(t, p)).rows;
const one = async (t, p) => (await q(t, p))[0];

let pass = 0, fail = 0;
const failures = [];
function check(name, ok, detail = "") {
  if (ok) pass++; else { fail++; failures.push(name); }
  console.log(`${ok ? "PASS" : "FAIL"}  [${PART}] ${name}${detail ? `  — ${detail}` : ""}`);
}

// --- sessions (same format as lib/users/session.ts) ---
const enc = new TextEncoder();
async function sign(v) {
  const d = await crypto.subtle.digest("SHA-256", enc.encode("demo-session-secret"));
  const k = await crypto.subtle.importKey("raw", d, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return Buffer.from(await crypto.subtle.sign("HMAC", k, enc.encode(v))).toString("hex");
}
async function token(payload) { const s = `${payload}.${Date.now() + 3600_000}`; return `${s}.${await sign(s)}`; }
const cookieFor = async (id, staff = false) => `vericert_customer_session=${await token(staff ? `${id}~2fa~${Date.now()}` : `${id}~s~${Date.now()}`)}`;
const COMMAND = await cookieFor("demo-command", true);
const OFFICE = await cookieFor("demo-office", true);
const BUYER = await cookieFor("demo-customer");

async function api(path, { method = "GET", body, cookie } = {}) {
  const res = await fetch(BASE + path, {
    method, redirect: "manual",
    headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  const text = await res.text();
  try { data = JSON.parse(text); } catch { data = { raw: text.slice(0, 200) }; }
  return { status: res.status, data, text };
}

const strength = (sku) => one("SELECT s.id, s.sku, s.product_slug, s.label, p.name FROM product_strengths s JOIN products p ON p.slug = s.product_slug WHERE s.sku = $1", [sku]);
const stock = async (sid) => one("SELECT physical_quantity::int AS p, reserved_quantity::int AS r FROM strength_inventory WHERE strength_id = $1", [sid]);
const sellable = async (sid) => Number((await one("SELECT COALESCE((SELECT sellable FROM vc_sellable() WHERE strength_id = $1), 0) AS n", [sid])).n);
const customerBody = { firstName: "Bea", lastName: "Test", email: "buyer1@example.invalid", address: "1 Test St", city: "Austin", state: "TX", postalCode: "73301", country: "US" };
const orderBody = (s, qty, method, key) => ({
  customer: customerBody, items: [{ slug: s.product_slug, sizeLabel: s.label, strengthId: s.id, quantity: qty }],
  paymentMethod: method, researchAttestation: true, ...(key ? { idempotencyKey: key } : {}),
});
const orderByRef = (ref) => one("SELECT *, needs_review::text AS nr FROM orders WHERE reference = $1", [ref]);
async function receiveApproved(s, qty, cookie = COMMAND) {
  const r = await api(`/api/executive/inventory/${s.id}/lots`, { method: "POST", cookie, body: { quantity: qty, manufacturerLot: `MFR-${randomUUID().slice(0, 6)}`, idempotencyKey: randomUUID() } });
  const lotId = r.data?.result?.lot_id;
  const a = await api(`/api/executive/lots/${lotId}`, { method: "PATCH", cookie, body: { testingStatus: "passed", releaseStatus: "approved", vericertLotNumber: `VC-T-${randomUUID().slice(0, 8)}`, reason: "test approval", idempotencyKey: randomUUID() } });
  return { lotId, receive: r, approve: a };
}
async function setConfig(enabled, extra = {}) {
  return api("/api/executive/payment-methods", { method: "PUT", cookie: COMMAND, body: { enabled, reservationMinutes: {}, achFulfillment: "after_settlement", ...extra } });
}
async function ensureCustomers(n) {
  for (let i = 3; i < 3 + n; i++) {
    await q(`INSERT INTO users (id, email, password_hash, created_at, first_name, last_name, research_category, registration_ack_at, registration_ack_text, age_attested_at, research_prompt_resolved_at, email_verified)
             VALUES ($1, $2, 'x', now()::text, 'Buyer', 'Test', 'Academic research', now()::text, 'ack', now()::text, now()::text, TRUE) ON CONFLICT (id) DO NOTHING`,
      [`demo-customer${i}`, `buyer${i}@example.invalid`]);
  }
}
await q("DELETE FROM rate_limits");
const notified = async (orderId, template) => Number((await one("SELECT count(*)::int AS n FROM order_events WHERE order_id = $1 AND event_type = 'customer_notified' AND details->>'template' = $2", [orderId, template])).n);
// Emails are logged by the app's dev fallback (no Resend key locally); SERVER_LOG points at the server's output.
const serverLog = () => (process.env.SERVER_LOG ? require_fs().readFileSync(process.env.SERVER_LOG, "utf8") : "");
function require_fs() { return globalThis.__fs; }
const countIn = (text, needle) => text.split(needle).length - 1;

if (PART === "A") {
  const S = await strength("KPV-10MG");
  const S2 = await strength("SEMAX-11MG");
  const S3 = await strength("SS-31-10MG");

  // --- authorization ---
  const execEndpoints = [
    ["GET", "/api/executive/orders"], ["GET", "/api/executive/orders/x"], ["POST", "/api/executive/orders/x/confirm-payment"],
    ["POST", "/api/executive/orders/x/void-payment"], ["POST", "/api/executive/orders/x/cancel"], ["POST", "/api/executive/orders/x/refund"],
    ["PATCH", "/api/executive/orders/x/status"], ["POST", "/api/executive/orders/x/return"], ["POST", "/api/executive/orders/x/review"],
    ["GET", "/api/executive/reservations"], ["POST", "/api/executive/reservations"], ["POST", "/api/executive/reservations/x/release"],
    ["GET", "/api/executive/payment-methods"], ["PUT", "/api/executive/payment-methods"], ["POST", `/api/executive/inventory/${S.id}/lots`],
    ["GET", "/api/executive/lots/x"], ["PATCH", "/api/executive/lots/x"], ["POST", "/api/executive/lots/x/split"],
    ["POST", `/api/executive/inventory/${S.id}/adjustments`], ["GET", `/api/executive/inventory/${S.id}`],
  ];
  let anonOk = 0, buyerOk = 0;
  for (const [m, p] of execEndpoints) {
    const a = await api(p, { method: m, body: m === "GET" ? undefined : {} });
    const b = await api(p, { method: m, body: m === "GET" ? undefined : {}, cookie: BUYER });
    if (a.status === 401) anonOk++;
    if (b.status === 401) buyerOk++;
  }
  check(`auth: all ${execEndpoints.length} Stage 3 executive endpoints refuse a signed-out request (401)`, anonOk === execEndpoints.length, `${anonOk}/${execEndpoints.length}`);
  check(`auth: all ${execEndpoints.length} refuse a signed-in customer (401)`, buyerOk === execEndpoints.length, `${buyerOk}/${execEndpoints.length}`);
  const staleStaff = `vericert_customer_session=${await token(`demo-command~s~${Date.now()}`)}`;
  check("auth: a staff session without two-factor is refused", (await api("/api/executive/orders", { cookie: staleStaff })).status === 401);
  check("auth: /office staff have the same order access as /command", (await api("/api/executive/orders", { cookie: OFFICE })).status === 200);
  const sim = await api("/api/executive/payments/simulate", { method: "POST", cookie: COMMAND, body: { reference: "VC-X", kind: "confirmed", eventId: "e1" } });
  check("simulation endpoint does not exist when simulation is off (404, even for staff)", sim.status === 404);

  // --- payment configuration ---
  const pm = await api("/api/executive/payment-methods", { cookie: COMMAND });
  const offered = pm.data.methods.filter((m) => m.offered).map((m) => m.id);
  check("payments: by default NO method is offered — not even bank transfer or Zelle, whose local details are set", offered.length === 0, offered.join(",") || "none");
  check("payments: bank transfer and Zelle are reported ready but switched off", ["bank_transfer", "zelle"].every((id) => { const m = pm.data.methods.find((x) => x.id === id); return m.ready && !m.enabled && !m.offered; }));
  check("payments: response contains no secret-like values", !/sk_|whsec|api[_-]?key|password/i.test(JSON.stringify(pm.data)));
  check("payments: every one of the 8 methods is reported with liveIntegration false", ["bitcoin", "ethereum", "usdc", "zelle", "ach", "card", "apple_pay", "google_pay"].every((id) => pm.data.methods.find((m) => m.id === id)?.info.liveIntegration === false));
  const gen = await api("/api/executive/content", { method: "PATCH", cookie: COMMAND, body: { key: "payment_methods", value: { enabled: { bitcoin: true } } } });
  check("payments: the generic Site Content endpoint can't write the payment settings (403)", gen.status === 403);
  for (const m of ["bank_transfer", "zelle", "bitcoin", "ethereum", "usdc", "ach", "card", "apple_pay", "google_pay", "crypto"]) {
    const r = await api("/api/orders", { method: "POST", cookie: BUYER, body: orderBody(S, 1, m) });
    check(`checkout: ${m} refused on a direct API request while switched off (400)`, r.status === 400);
  }
  check("checkout: no order was saved by any refused request (the only orders are the pre-Stage-3 bank-transfer ones)", Number((await one("SELECT count(*)::int AS n FROM orders WHERE payment_method <> 'bank_transfer' OR reference NOT LIKE 'VC-LEG%' AND reference NOT IN ('VC-E3SQJ9', 'VC-38UTPQ')")).n) === 0);
  await q("DELETE FROM rate_limits"); // the loop above counts against the (unchanged) 20/hour order limit
  const off = await api("/api/orders", { method: "POST", cookie: BUYER, body: orderBody(S, 1, "zelle") });
  check("checkout: a switched-off method is refused on a direct API request (400)", off.status === 400, off.data?.error);
  const bad = await setConfig({ bitcoin: true, card: true, ach: true, apple_pay: true, google_pay: true, ethereum: true, usdc: true, zelle: true, bank_transfer: true });
  check("payments: switches saved", bad.status === 200);
  const states = Object.fromEntries(bad.data.methods.map((m) => [m.id, m]));
  check("payments: switching provider methods on does NOT offer them (no provider)", ["bitcoin", "ethereum", "usdc", "ach", "card", "apple_pay", "google_pay"].every((id) => states[id].enabled && !states[id].offered));
  check("payments: Zelle switched on + recipient configured → offered", states.zelle.offered === true);
  for (const m of ["bitcoin", "card", "ach", "apple_pay"]) {
    const r = await api("/api/orders", { method: "POST", cookie: BUYER, body: orderBody(S, 1, m) });
    check(`checkout: ${m} refused by the server even when switched on (400)`, r.status === 400);
  }
  const log = await one("SELECT details FROM activity_log WHERE action = 'payments.config_changed' ORDER BY created_at DESC LIMIT 1");
  check("payments: the change is in the activity log with what changed", /zelle on/.test(log?.details ?? ""), log?.details);
  const badCfg = await api("/api/executive/payment-methods", { method: "PUT", cookie: COMMAND, body: { enabled: { zelle: true }, reservationMinutes: { bitcoin: 1 }, achFulfillment: "after_settlement" } });
  check("payments: a reservation window under 5 minutes is rejected (400)", badCfg.status === 400);
  await setConfig({ zelle: true, bank_transfer: true });

  // --- ordering gate preserved ---
  await q("UPDATE site_content SET value = '{\"enabled\":false}' WHERE key = 'ordering'");
  const gated = await api("/api/orders", { method: "POST", cookie: BUYER, body: orderBody(S, 1, "zelle") });
  check("ordering gate: switched off → 403 before anything is saved", gated.status === 403);
  await q("UPDATE site_content SET value = '{\"enabled\":true}' WHERE key = 'ordering'");

  // --- the 2,377 recorded units sit in quarantined reconciliation lots: no surface may show a count or "in stock" ---
  {
    const signedIn = { Cookie: `${BUYER}; vericert_age_ack=1` };
    const pages = [["/", {}, "home (signed out)"], ["/", signedIn, "home (signed in)"], ["/shop", signedIn, "catalog"], [`/shop/${S.product_slug}`, signedIn, "product page"]];
    for (const [path, headers, label] of pages) {
      const html = await (await fetch(BASE + path, { headers })).text();
      const counts = html.match(/Only \d+ left|only \d+ left/g) ?? [];
      const inStock = /\\?"status\\?":\\?"(in|low)\\?"/.test(html) || /schema\.org\/(InStock|LimitedAvailability)/.test(html);
      const remaining = /\\?"remaining\\?":[1-9]/.test(html);
      check(`reconciliation-only stock: ${label} shows no count and no in-stock state`, counts.length === 0 && !inStock && !remaining, `${counts.length} counts, inStock=${inStock}, remaining>0=${remaining}`);
    }
  }

  // --- sellable: quarantined reconciliation lot can't be bought ---
  const recon = await api("/api/orders", { method: "POST", cookie: BUYER, body: orderBody(S, 1, "zelle") });
  check("checkout: stock only in the quarantined reconciliation lot is not orderable (409)", recon.status === 409, recon.data?.error);
  // Signed out, the catalog gate shows no stock at all (unchanged); signed in, the product's schema.org availability
  // is the stock state the page renders.
  const shopPage = async () => (await fetch(`${BASE}/shop/${S.product_slug}`, { headers: { Cookie: `${BUYER}; vericert_age_ack=1` } })).text();
  const page0 = await shopPage();
  check("shop (signed in): a product whose only stock is quarantined is OutOfStock, no Add to Cart", /schema\.org\/OutOfStock/.test(page0) && !/schema\.org\/InStock/.test(page0) && !/Add to Cart/.test(page0));

  // --- lots via API ---
  const badApprove = await api(`/api/executive/inventory/${S.id}/lots`, { method: "POST", cookie: COMMAND, body: { quantity: 5, idempotencyKey: randomUUID() } });
  const nb = await api(`/api/executive/lots/${badApprove.data.result.lot_id}`, { method: "PATCH", cookie: COMMAND, body: { releaseStatus: "approved", idempotencyKey: randomUUID() } });
  check("lots: received lot starts pending/untested and is not sellable", (await sellable(S.id)) === 0);
  check("lots: approving an untested lot without justification is refused (400)", nb.status === 400, nb.data?.error);
  const noVc = await api(`/api/executive/lots/${badApprove.data.result.lot_id}`, { method: "PATCH", cookie: COMMAND, body: { testingStatus: "passed", releaseStatus: "approved", idempotencyKey: randomUUID() } });
  check("D4 (API): a tested lot without a VeriCert lot number can't be approved (400, says why)", noVc.status === 400 && /VeriCert lot number/.test(noVc.data.error ?? ""), noVc.data.error);
  const withVc = await api(`/api/executive/lots/${badApprove.data.result.lot_id}`, { method: "PATCH", cookie: COMMAND, body: { testingStatus: "passed", releaseStatus: "approved", vericertLotNumber: "VC-D4-0001", idempotencyKey: randomUUID() } });
  check("D4 (API): the same lot approves once its VeriCert lot number is given", withVc.status === 200 && withVc.data.lot.releaseStatus === "approved" && withVc.data.lot.vericertLotNumber === "VC-D4-0001");
  await api(`/api/executive/lots/${badApprove.data.result.lot_id}`, { method: "PATCH", cookie: COMMAND, body: { releaseStatus: "quarantined", reason: "test lot, not for sale", idempotencyKey: randomUUID() } });
  const okA = await receiveApproved(S, 20);
  await api(`/api/executive/lots/${okA.lotId}`, { method: "PATCH", cookie: COMMAND, body: { vericertLotNumber: "VC-KPV-001", idempotencyKey: randomUUID() } });
  check("lots: receive + approve (testing passed) via API", okA.receive.status === 200 && okA.approve.status === 200 && (await sellable(S.id)) === 20);
  const dupKey = randomUUID();
  const r1 = await api(`/api/executive/inventory/${S2.id}/lots`, { method: "POST", cookie: COMMAND, body: { quantity: 7, idempotencyKey: dupKey } });
  const r2 = await api(`/api/executive/inventory/${S2.id}/lots`, { method: "POST", cookie: COMMAND, body: { quantity: 7, idempotencyKey: dupKey } });
  check("lots: a double-submitted receive creates one lot", r1.data.result.lot_id === r2.data.result.lot_id && r2.data.result.outcome === "duplicate");
  const adjNoLot = await api(`/api/executive/inventory/${S.id}/adjustments`, { method: "POST", cookie: COMMAND, body: { type: "stock_removed", quantity: 1, reason: "Damaged", idempotencyKey: randomUUID() } });
  check("adjustments: a lot is required (400)", adjNoLot.status === 400);
  const adjWrong = await api(`/api/executive/inventory/${S.id}/adjustments`, { method: "POST", cookie: COMMAND, body: { lotId: r1.data.result.lot_id, type: "stock_removed", quantity: 1, reason: "Damaged", idempotencyKey: randomUUID() } });
  check("adjustments: a lot of another strength is refused (400)", adjWrong.status === 400);
  const before = await stock(S.id);
  const adjOk = await api(`/api/executive/inventory/${S.id}/adjustments`, { method: "POST", cookie: COMMAND, body: { lotId: okA.lotId, type: "stock_removed", quantity: 2, reason: "Damaged", idempotencyKey: randomUUID() } });
  check("adjustments: removal from a lot moves the lot and the SKU together", adjOk.status === 200 && (await stock(S.id)).p === before.p - 2 && (await sellable(S.id)) === 18);
  const lotRow = await one("SELECT version::int AS v FROM inventory_lots WHERE id = $1", [okA.lotId]);
  const stale = await api(`/api/executive/inventory/${S.id}/adjustments`, { method: "POST", cookie: COMMAND, body: { lotId: okA.lotId, type: "count_correction", quantity: 10, reason: "Physical count", expectedVersion: lotRow.v - 1, idempotencyKey: randomUUID() } });
  check("adjustments: a stale count correction is refused (409 stale)", stale.status === 409 && stale.data.code === "stale");
  const page1 = await shopPage();
  check("shop (signed in): after approval the product is InStock with Add to Cart", /schema\.org\/InStock/.test(page1) && /Add to Cart/.test(page1));
  const reconLot = await one("SELECT id, physical_quantity::int AS p FROM inventory_lots WHERE strength_id = $1 AND kind = 'reconciliation'", [S3.id]);
  const split = await api(`/api/executive/lots/${reconLot.id}/split`, { method: "POST", cookie: COMMAND, body: { quantity: 10, reason: "batch label located", manufacturerLot: "MFR-REAL-1", vericertLotNumber: "VC-LOT-1", idempotencyKey: randomUUID() } });
  check("lots: splitting the reconciliation lot creates a pending lot; SKU total unchanged", split.status === 200 && split.data.lot.physical === 10 && split.data.lot.releaseStatus === "pending");
  const lotGet = await api(`/api/executive/lots/${split.data.lot.id}`, { cookie: COMMAND });
  check("lots: traceability history lists the transfer in", lotGet.data.movements.some((m) => m.type === "lot_transfer_in"));

  // --- Zelle checkout, idempotency ---
  const key = randomUUID();
  const s0 = await stock(S.id);
  const z1 = await api("/api/orders", { method: "POST", cookie: BUYER, body: orderBody(S, 2, "zelle", key) });
  const z2 = await api("/api/orders", { method: "POST", cookie: BUYER, body: orderBody(S, 2, "zelle", key) });
  check("checkout (Zelle): order created", z1.status === 200 && Boolean(z1.data.reference), JSON.stringify(z1.data));
  check("checkout: the same attempt submitted twice returns the same order", z2.data.reference === z1.data.reference && z2.data.duplicate === true);
  const conc = await Promise.all(Array.from({ length: 6 }, () => api("/api/orders", { method: "POST", cookie: BUYER, body: orderBody(S, 1, "zelle", "conc-" + key) })));
  check("checkout: 6 simultaneous submissions of one attempt create one order", new Set(conc.map((c) => c.data.reference)).size === 1 && conc.every((c) => c.status === 200),
    conc.map((c) => c.status).join(","));
  const zo = await orderByRef(z1.data.reference);
  check("Zelle: nothing reserved or deducted at order creation", (await stock(S.id)).r === s0.r && (await stock(S.id)).p === s0.p && zo.fulfillment_status === "unfulfilled" && zo.payment_status === "pending");
  check("pricing: line price and total come from the catalog, not the request", Number(zo.total) > 0 && JSON.parse(zo.items)[0].priceUsd > 0 && JSON.parse(zo.items)[0].strengthId === S.id && JSON.parse(zo.items)[0].sku === S.sku);
  const orderPage = await fetch(`${BASE}/order/${zo.reference}`, { headers: { Cookie: BUYER } }).then((r) => r.text());
  check("order page: Zelle shows the configured recipient and the reference, no bank details", /LOCAL TEST RECIPIENT/.test(orderPage) && orderPage.includes(zo.reference) && !/Routing Number/i.test(orderPage));
  const tooMany = await api("/api/orders", { method: "POST", cookie: BUYER, body: orderBody(S, 999, "zelle") });
  check("checkout: more than the sellable quantity is refused (409)", tooMany.status === 409);
  await q("UPDATE product_strengths SET availability_status = 'coming_soon' WHERE id = $1", [S2.id]);
  const notStock = await api("/api/orders", { method: "POST", cookie: BUYER, body: orderBody(S2, 1, "zelle") });
  check("checkout: a strength not marked In Stock is refused (409)", notStock.status === 409);
  await q("UPDATE product_strengths SET availability_status = 'in_stock' WHERE id = $1", [S2.id]);
  await q("UPDATE product_strengths SET active = FALSE WHERE id = $1", [S2.id]);
  const inactive = await api("/api/orders", { method: "POST", cookie: BUYER, body: orderBody(S2, 1, "zelle") });
  check("checkout: an inactive strength is refused (400)", inactive.status === 400);
  await q("UPDATE product_strengths SET active = TRUE WHERE id = $1", [S2.id]);

  // --- Zelle confirmation (governance C) ---
  const base = `/api/executive/orders/${zo.id}`;
  const noRef = await api(`${base}/confirm-payment`, { method: "POST", cookie: COMMAND, body: { amountReceived: Number(zo.total), receivedOn: "2026-11-18", attested: true } });
  check("confirm: without a reference → 400, nothing changed", noRef.status === 400 && (await orderByRef(zo.reference)).payment_status === "pending");
  const noAtt = await api(`${base}/confirm-payment`, { method: "POST", cookie: COMMAND, body: { reference: "ZEL-12345", amountReceived: Number(zo.total), receivedOn: "2026-11-18" } });
  check("confirm: without the attestation → 400", noAtt.status === 400);
  const bare = await api(`${base}/confirm-payment`, { method: "POST", cookie: COMMAND, body: {} });
  check("confirm: a bare click (empty body) → 400", bare.status === 400);
  const wrongAmt = await api(`${base}/confirm-payment`, { method: "POST", cookie: COMMAND, body: { reference: "ZEL-WRONG", amountReceived: 1, receivedOn: "2026-11-18", attested: true } });
  const zw = await orderByRef(zo.reference);
  check("confirm: wrong amount → 409, NOT confirmed, order in review", wrongAmt.status === 409 && zw.payment_status === "pending" && zw.nr === "true");
  const s1 = await stock(S.id);
  const okC = await api(`${base}/confirm-payment`, { method: "POST", cookie: COMMAND, body: { reference: "ZEL-REF-777", amountReceived: Number(zo.total), receivedOn: "2026-11-18", note: "seen in the business account", attested: true } });
  const zc = await orderByRef(zo.reference);
  check("confirm: correct reference + amount → confirmed and stock deducted", okC.status === 200 && okC.data.outcome === "confirmed" && (await stock(S.id)).p === s1.p - 2);
  {
    const line = JSON.parse((await orderByRef(zo.reference)).items)[0];
    check("lots: a new order line carries no assumed lot number", line.lotNumber === undefined);
    const page = await (await fetch(`${BASE}/order/${zo.reference}`, { headers: { Cookie: BUYER } })).text();
    const assumed = (await one("SELECT batch_numbers FROM products WHERE slug = $1", [S.product_slug])).batch_numbers;
    const listed = JSON.parse(assumed ?? "[]")[0];
    check("lots: the order page shows the ACTUAL allocated VeriCert lot", /data-fulfilled-lots/.test(page) && page.includes("VC-KPV-001"));
    check("lots: …and not the product's listed batch", !listed || !page.includes(`/lot/${encodeURIComponent(listed)}`), listed ?? "(product lists no batch)");
    check("notifications: one 'payment confirmed' message, no hold message", (await notified(zo.id, "payment_confirmed")) === 1 && (await notified(zo.id, "payment_received_hold")) === 0);
    const log = serverLog();
    check("email (dev log): the payment-confirmed email names the allocated lot", !process.env.SERVER_LOG || /Payment Received — VeriCert Order [^\n]*\n[\s\S]*?lot VC-KPV-001/.test(log.slice(log.lastIndexOf(`Subject: Payment Received — VeriCert Order ${zo.reference}`))));
  }
  {
    // A pre-Stage-3 line that carries an assumed lot number: never shown.
    const leg = await orderByRef("VC-LEG003");
    const items = JSON.parse(leg.items); items[0].lotNumber = "ASSUMED-LOT-1";
    await q("UPDATE orders SET items = $2 WHERE id = $1", [leg.id, JSON.stringify(items)]);
    const page = await (await fetch(`${BASE}/order/VC-LEG003`, { headers: { Cookie: BUYER } })).text();
    check("lots: a stored (assumed) lot number on an old order line is not shown to the customer", !page.includes("ASSUMED-LOT-1"));
  }
  check("confirm: reference, amount, date, administrator and time stored on the order",
    zc.payment_reference === "ZEL-REF-777" && Number(zc.payment_amount_received) === Number(zo.total) && zc.payment_received_on !== null && zc.payment_confirmed_by === "admin:command@example.invalid" && Boolean(zc.payment_confirmed_at) && zc.payment_source === "admin");
  const act = await one("SELECT details FROM activity_log WHERE action = 'order.payment_confirmed' ORDER BY created_at DESC LIMIT 1");
  check("confirm: activity log names the reference", /ZEL-REF-777/.test(act?.details ?? ""));
  const again = await api(`${base}/confirm-payment`, { method: "POST", cookie: COMMAND, body: { reference: "ZEL-REF-778", amountReceived: Number(zo.total), receivedOn: "2026-11-18", attested: true } });
  check("confirm: a second confirmation of the same order → 409, no second deduction", again.status === 409 && (await stock(S.id)).p === s1.p - 2);
  const z3 = await api("/api/orders", { method: "POST", cookie: BUYER, body: orderBody(S, 1, "zelle") });
  const zo3 = await orderByRef(z3.data.reference);
  const reuse = await api(`/api/executive/orders/${zo3.id}/confirm-payment`, { method: "POST", cookie: COMMAND, body: { reference: "zel-ref-777", amountReceived: Number(zo3.total), receivedOn: "2026-11-18", attested: true } });
  check("confirm: a reference already used on another order → 409 with a clear message", reuse.status === 409 && /already recorded on another order/.test(reuse.data.error));
  const det = await api(base, { cookie: OFFICE });
  check("order detail: lines, allocations (lot), events and movements returned", det.status === 200 && det.data.allocations.length >= 1 && det.data.events.some((e) => e.type === "payment_confirmed") && det.data.movements.length >= 1);

  // --- fulfillment, refund after shipment, returns ---
  const noTrack = await api(`${base}/status`, { method: "PATCH", cookie: COMMAND, body: { status: "shipped", carrier: "USPS" } });
  check("ship: tracking number required (400)", noTrack.status === 400);
  const proc = await api(`${base}/status`, { method: "PATCH", cookie: COMMAND, body: { status: "processing" } });
  const ship = await api(`${base}/status`, { method: "PATCH", cookie: COMMAND, body: { status: "shipped", carrier: "USPS", trackingNumber: "9400 TEST" } });
  const back = await api(`${base}/status`, { method: "PATCH", cookie: COMMAND, body: { status: "processing" } });
  check("fulfillment: processing → shipped recorded with tracking; backwards refused", proc.status === 200 && ship.status === 200 && back.status === 409 && (await orderByRef(zo.reference)).tracking_number === "9400 TEST");
  const cxl = await api(`${base}/cancel`, { method: "POST", cookie: COMMAND, body: {} });
  check("cancel: refused after shipment (409)", cxl.status === 409);
  const sx = await stock(S.id);
  const ov0 = (await api("/api/executive/overview", { cookie: COMMAND })).data;
  const pk = randomUUID();
  const p1 = await api(`${base}/refund`, { method: "POST", cookie: COMMAND, body: { reason: "customer_request", amount: 10, idempotencyKey: pk } });
  const p1b = await api(`${base}/refund`, { method: "POST", cookie: COMMAND, body: { reason: "customer_request", amount: 10, idempotencyKey: pk } });
  const zp = await orderByRef(zo.reference);
  check("partial refund (API): partially refunded, cumulative 10, no stock change", p1.status === 200 && zp.payment_status === "partially_refunded" && Number(zp.refund_amount) === 10 && (await stock(S.id)).p === sx.p);
  check("partial refund (API): double submission recorded once", p1b.data.result.outcome === "duplicate" && Number((await orderByRef(zo.reference)).refund_amount) === 10);
  const p2 = await api(`${base}/refund`, { method: "POST", cookie: COMMAND, body: { reason: "customer_request", amount: 10, idempotencyKey: randomUUID() } });
  const over = await api(`${base}/refund`, { method: "POST", cookie: COMMAND, body: { reason: "customer_request", amount: Number(zo.total), idempotencyKey: randomUUID() } });
  check("second partial refund (API): cumulative 20; refunding past the amount paid → 400, nothing changed", p2.status === 200 && Number((await orderByRef(zo.reference)).refund_amount) === 20 && over.status === 400);
  const ov1 = (await api("/api/executive/overview", { cookie: COMMAND })).data;
  const rev = (o) => o?.revenueAllTime ?? o?.overview?.revenueAllTime;
  check("revenue: a partially refunded order counts at its net amount (all-time revenue −20)", Math.abs((rev(ov0) - rev(ov1)) - 20) < 0.01, `${rev(ov0)} → ${rev(ov1)}`);
  const ref1 = await api(`${base}/refund`, { method: "POST", cookie: COMMAND, body: { reason: "customer_request", note: "test", idempotencyKey: randomUUID() } });
  const ov2 = (await api("/api/executive/overview", { cookie: COMMAND })).data;
  check("refund after shipment: remaining balance → fully refunded, stock NOT restored", ref1.status === 200 && (await stock(S.id)).p === sx.p && (await orderByRef(zo.reference)).payment_status === "refunded");
  check("revenue: a fully refunded order no longer counts", Math.abs((rev(ov0) - rev(ov2)) - Number(zo.total)) < 0.01, `${rev(ov0)} → ${rev(ov2)}`);
  check("refund history: three refunds recorded (10, 10, remainder)", Number((await one("SELECT count(*)::int AS n FROM order_refunds WHERE order_id = $1", [zo.id])).n) === 3);
  const alloc = det.data.allocations.find((a) => a.state === "committed");
  const rk = randomUUID();
  const ret1 = await api(`${base}/return`, { method: "POST", cookie: COMMAND, body: { lineIndex: 0, allocationId: alloc.id, quantity: 1, condition: "sealed", decision: "restock", reason: "unopened", idempotencyKey: rk } });
  const ret1b = await api(`${base}/return`, { method: "POST", cookie: COMMAND, body: { lineIndex: 0, allocationId: alloc.id, quantity: 1, condition: "sealed", decision: "restock", reason: "unopened", idempotencyKey: rk } });
  check("return restock: +1 into the shipped lot; the repeat is recorded once", ret1.status === 200 && ret1b.data.result.outcome === "duplicate" && (await stock(S.id)).p === sx.p + 1);
  const ret2 = await api(`${base}/return`, { method: "POST", cookie: COMMAND, body: { lineIndex: 0, allocationId: alloc.id, quantity: 5, condition: "x", decision: "discard", reason: "x", idempotencyKey: randomUUID() } });
  check("return: more than shipped is refused (400)", ret2.status === 400);

  // --- cancel before payment, void ---
  const c1 = await api(`/api/executive/orders/${zo3.id}/cancel`, { method: "POST", cookie: COMMAND, body: { reason: "customer changed mind" } });
  const c2 = await api(`/api/executive/orders/${zo3.id}/cancel`, { method: "POST", cookie: COMMAND, body: { reason: "again" } });
  check("cancel before payment: ok; repeat is harmless", c1.status === 200 && c2.status === 200 && (await orderByRef(zo3.reference)).fulfillment_status === "cancelled");
  const z4 = await api("/api/orders", { method: "POST", cookie: BUYER, body: orderBody(S, 3, "zelle") });
  const zo4 = await orderByRef(z4.data.reference);
  await api(`/api/executive/orders/${zo4.id}/confirm-payment`, { method: "POST", cookie: COMMAND, body: { reference: "ZEL-VOID-1", amountReceived: Number(zo4.total), receivedOn: "2026-11-18", attested: true } });
  const sv = await stock(S.id);
  const vshort = await api(`/api/executive/orders/${zo4.id}/void-payment`, { method: "POST", cookie: COMMAND, body: { reason: "short" } });
  const vok = await api(`/api/executive/orders/${zo4.id}/void-payment`, { method: "POST", cookie: OFFICE, body: { reason: "confirmed against the wrong notification" } });
  const zv = await orderByRef(zo4.reference);
  check("void: needs a reason of 10+ characters (400)", vshort.status === 400);
  check("void: restores stock, returns the order to pending, frees the reference", vok.status === 200 && (await stock(S.id)).p === sv.p + 3 && zv.payment_status === "pending" && zv.payment_reference === null);
  const vev = await one("SELECT details, actor FROM order_events WHERE order_id = $1 AND event_type = 'payment_confirmation_voided'", [zo4.id]);
  check("void: history keeps the voided reference and the voiding administrator", vev?.details?.voided_reference === "ZEL-VOID-1" && vev.actor === "admin:office@example.invalid");

  // --- review: insufficient at confirmation ---
  const sR = await strength("TESAMORELIN-10MG");
  const rl = await receiveApproved(sR, 3);
  const zr = await api("/api/orders", { method: "POST", cookie: BUYER, body: orderBody(sR, 3, "zelle") });
  const zor = await orderByRef(zr.data.reference);
  await api(`/api/executive/inventory/${sR.id}/adjustments`, { method: "POST", cookie: COMMAND, body: { lotId: rl.lotId, type: "stock_removed", quantity: 2, reason: "Damaged", idempotencyKey: randomUUID() } });
  const cr = await api(`/api/executive/orders/${zor.id}/confirm-payment`, { method: "POST", cookie: COMMAND, body: { reference: "ZEL-SHORT-1", amountReceived: Number(zor.total), receivedOn: "2026-11-18", attested: true } });
  const orr = await orderByRef(zor.reference);
  check("review: stock gone by confirmation → payment recorded, review opened, nothing deducted", cr.data.outcome === "insufficient_stock" && orr.nr === "true" && orr.payment_status === "confirmed" && (await stock(sR.id)).p >= 1);
  check("hold notification: exactly one 'payment received — completing a check' message; no 'processing' message", (await notified(zor.id, "payment_received_hold")) === 1 && (await notified(zor.id, "payment_confirmed")) === 0);
  {
    const page = await (await fetch(`${BASE}/order/${zor.reference}`, { headers: { Cookie: BUYER } })).text();
    check("order page during the hold: says payment received and a final check is under way", /Payment Received/i.test(page) && /completing a final check/.test(page));
    check("order page during the hold: no internal reason, nothing about stock, no 'Thank you — your order is in'", !/could not be deducted|Not enough|sellable|stock/i.test(page.replace(/<script[\s\S]*?<\/script>/g, "")) && !/your order is in/.test(page));
    const log = serverLog();
    if (process.env.SERVER_LOG) {
      check("email (dev log): one hold email for the order, and no 'now processing' email", countIn(log, `Subject: Payment received — VeriCert order ${zor.reference}`) === 1 && countIn(log, `We've confirmed payment for order ${zor.reference}`) === 0);
      const body = log.slice(log.indexOf(`Subject: Payment received — VeriCert order ${zor.reference}`)).split("[email:dev-fallback]")[0];
      check("hold email: plain, says payment received + final check, no suspicion/stock/reason wording", /received your payment/.test(body) && /final check/.test(body) && !/suspect|fraud|verify your identity|stock|inventory|insufficient|review/i.test(body));
    }
  }
  const shipR = await api(`/api/executive/orders/${zor.id}/status`, { method: "PATCH", cookie: COMMAND, body: { status: "shipped", trackingNumber: "X" } });
  check("review: an order in review can't be shipped (409)", shipR.status === 409);
  const allocFail = await api(`/api/executive/orders/${zor.id}/review`, { method: "POST", cookie: COMMAND, body: { action: "allocate" } });
  check("review: allocate now refused while still short (409), nothing changed", allocFail.status === 409);
  await receiveApproved(sR, 5);
  const allocOk = await api(`/api/executive/orders/${zor.id}/review`, { method: "POST", cookie: COMMAND, body: { action: "allocate" } });
  check("review: allocate now succeeds once stock arrives; review cleared", allocOk.status === 200 && (await orderByRef(zor.reference)).nr === "false" && (await orderByRef(zor.reference)).fulfillment_status === "allocated");
  check("after the hold: one 'payment confirmed — processing' message now; still one hold message", (await notified(zor.id, "payment_confirmed")) === 1 && (await notified(zor.id, "payment_received_hold")) === 1);
  if (process.env.SERVER_LOG) check("email (dev log): the 'processing' email follows the hold exactly once", countIn(serverLog(), `We've confirmed payment for order ${zor.reference}`) === 1);

  // --- controlled reallocation (API) ---
  {
    await q("DELETE FROM rate_limits"); // this suite places many orders as one customer (the 20/hour limit is unchanged)
    const sQ = await strength("MOTS-C-10MG");
    const la = await receiveApproved(sQ, 2);
    const z = await api("/api/orders", { method: "POST", cookie: BUYER, body: orderBody(sQ, 2, "zelle") });
    check("reallocation (API) setup: order placed", z.status === 200, `${z.status} ${JSON.stringify(z.data).slice(0, 120)}`);
    const oz = await orderByRef(z.data.reference);
    await api(`/api/executive/orders/${oz.id}/confirm-payment`, { method: "POST", cookie: COMMAND, body: { reference: "ZEL-RA-API", amountReceived: Number(oz.total), receivedOn: "2026-11-18", attested: true } });
    await api(`/api/executive/lots/${la.lotId}`, { method: "PATCH", cookie: COMMAND, body: { releaseStatus: "quarantined", reason: "carton damage reported", idempotencyKey: randomUUID() } });
    check("reallocation (API): quarantining the lot puts the order in review", (await orderByRef(oz.reference)).nr === "true");
    check("D5: the customer is told once that payment was received and shipping is held", (await notified(oz.id, "payment_received_hold")) === 1);
    {
      const page = (await (await fetch(`${BASE}/order/${oz.reference}`, { headers: { Cookie: BUYER } })).text()).replace(/<script[\s\S]*?<\/script>/g, "");
      check("D5: order page shows 'payment received / final check', nothing about the lot, quarantine or reason",
        /Payment Received/i.test(page) && /completing a final check/.test(page) && !/quarantin|carton|damage|lot no longer|LOT-\d|Reallocation/i.test(page));
      if (process.env.SERVER_LOG) {
        const log = serverLog();
        const body = log.slice(log.indexOf(`Subject: Payment received — VeriCert order ${oz.reference}`)).split("[email:dev-fallback]")[0];
        check("D5: the hold email is the approved copy — no quarantine, lot, reason, stock or review wording; no 'reply'",
          countIn(log, `Subject: Payment received — VeriCert order ${oz.reference}`) === 1 && /received your payment/.test(body) && /final check/.test(body)
          && !/quarantin|carton|damage|LOT-\d|reason|stock|inventory|review|reply/i.test(body));
      }
    }
    const shortR = await api(`/api/executive/orders/${oz.id}/reallocate`, { method: "POST", cookie: COMMAND, body: { reason: "short" } });
    const hold = await api(`/api/executive/orders/${oz.id}/reallocate`, { method: "POST", cookie: COMMAND, body: { reason: "lot quarantined, no replacement yet" } });
    check("reallocation (API): reason required (400); without approved stock → on hold, nothing moved", shortR.status === 400 && hold.data.outcome === "on_hold");
    check("reallocation (API): the failed reallocation continues the same hold — still exactly one hold message", (await notified(oz.id, "payment_received_hold")) === 1);
    const lb = await receiveApproved(sQ, 5);
    const ok = await api(`/api/executive/orders/${oz.id}/reallocate`, { method: "POST", cookie: OFFICE, body: { reason: "replacement lot received and approved" } });
    const al = await q("SELECT lot_id, state, replaces_allocation_id FROM inventory_allocations WHERE order_id = $1", [oz.id]);
    check("reallocation (API): moved to the approved lot, original kept as restored, replacement linked", ok.data.outcome === "reallocated" && al.some((a) => a.state === "restored" && a.lot_id === la.lotId) && al.some((a) => a.state === "committed" && a.lot_id === lb.lotId && a.replaces_allocation_id));
    const ev = await one("SELECT actor FROM order_events WHERE order_id = $1 AND event_type = 'stock_reallocated'", [oz.id]);
    check("reallocation (API): recorded with the administrator", ev?.actor === "admin:office@example.invalid");
    const ship = await api(`/api/executive/orders/${oz.id}/status`, { method: "PATCH", cookie: COMMAND, body: { status: "shipped", trackingNumber: "RA1" } });
    check("reallocation (API): the order can ship afterwards", ship.status === 200);
  }

  // --- reconciliation lots: reduce to what is physically held (including 0); VeriCert-only lot numbers ---
  {
    const sD = await strength("DSIP-5MG");
    const recon = (await api(`/api/executive/inventory/${sD.id}`, { cookie: COMMAND })).data.lots.find((l) => l.kind === "reconciliation");
    const z = await api(`/api/executive/inventory/${sD.id}/adjustments`, { method: "POST", cookie: COMMAND, body: { lotId: recon.id, type: "count_correction", quantity: 0, reason: "Not physically received (planned quantity)", expectedVersion: recon.version, idempotencyKey: randomUUID() } });
    const after = (await api(`/api/executive/inventory/${sD.id}`, { cookie: COMMAND })).data;
    check("reconciliation lot (API): counted down to 0 — SKU physical 0, movement recorded, still quarantined",
      z.status === 200 && after.row.physical === 0 && after.movements[0].type === "count_correction" && after.lots.find((l) => l.id === recon.id).releaseStatus === "quarantined");
    const r = await api(`/api/executive/inventory/${sD.id}/lots`, { method: "POST", cookie: COMMAND, body: { quantity: 8, vericertLotNumber: "VC-DSIP-0001", idempotencyKey: randomUUID() } });
    check("receive (API): actual stock into a lot identified by its VeriCert lot number only (pending)", r.status === 200 && Boolean(r.data.result?.lot_id) && r.data.result.outcome === "received");
    const lots = (await api(`/api/executive/inventory/${sD.id}`, { cookie: COMMAND })).data.lots;
    const nl = lots.find((l) => l.vericertLotNumber === "VC-DSIP-0001");
    check("…stored without a manufacturer lot, pending, not sellable; SKU total = 8", nl && nl.manufacturerLot === null && nl.releaseStatus === "pending" && !nl.eligible && (await stock(sD.id)).p === 8);
  }
  const closeShort = await api(`/api/executive/orders/${zo.id}/review`, { method: "POST", cookie: COMMAND, body: { action: "close", note: "x" } });
  check("review: closing requires a 10+ character note (400)", closeShort.status === 400);

  // --- legacy order ---
  const leg = await orderByRef("VC-LEG002");
  const lc = await api(`/api/executive/orders/${leg.id}/cancel`, { method: "POST", cookie: COMMAND, body: { reason: "legacy test" } });
  const legRecon = await one("SELECT physical_quantity::int AS p FROM inventory_lots WHERE strength_id = (SELECT items::jsonb->0->>'strengthId' FROM orders WHERE id = $1) AND kind = 'reconciliation'", [leg.id]);
  check("pre-Stage-3 paid order: cancel returns units to the quarantined reconciliation lot", lc.status === 200 && legRecon.p > 0);

  // --- search and filters ---
  const byRef = await api(`/api/executive/orders?search=${zo.reference.toLowerCase()}`, { cookie: COMMAND });
  const byEmail = await api(`/api/executive/orders?search=buyer1@example`, { cookie: COMMAND });
  const bySku = await api(`/api/executive/orders?search=${S.sku}`, { cookie: COMMAND });
  const byName = await api(`/api/executive/orders?search=bea%20test`, { cookie: COMMAND });
  const byPay = await api(`/api/executive/orders?paymentStatus=refunded`, { cookie: COMMAND });
  const byFul = await api(`/api/executive/orders?fulfillmentStatus=cancelled`, { cookie: COMMAND });
  const byRev = await api(`/api/executive/orders?review=1`, { cookie: COMMAND });
  const byDate = await api(`/api/executive/orders?from=2000-01-01&to=2000-01-02`, { cookie: COMMAND });
  const inj = await api(`/api/executive/orders?paymentStatus=${encodeURIComponent("x' OR 1=1 --")}`, { cookie: COMMAND });
  check("search: by order number", byRef.data.orders.length === 1 && byRef.data.orders[0].reference === zo.reference);
  check("search: by email", byEmail.data.orders.length >= 3);
  check("search: by SKU", bySku.data.orders.length >= 3 && bySku.data.orders.every((o) => o.items.some((i) => i.sku === S.sku || i.strengthId === S.id)));
  check("search: by customer name", byName.data.orders.length >= 3);
  check("filter: payment status", byPay.data.orders.length >= 1 && byPay.data.orders.every((o) => o.paymentStatus === "refunded"));
  check("filter: fulfillment status", byFul.data.orders.length >= 1 && byFul.data.orders.every((o) => o.fulfillmentStatus === "cancelled"));
  check("filter: needs review", byRev.data.orders.every((o) => o.needsReview));
  check("filter: date range (none in 2000)", byDate.data.orders.length === 0);
  check("filter: malformed status value ignored, not injected", inj.status === 200);

  // --- reservations view + cron ---
  const rv = await api("/api/executive/reservations", { cookie: COMMAND });
  check("reservations: view loads with heartbeat", rv.status === 200 && "heartbeat" in rv.data);
  const cronNo = await api("/api/cron/reservations");
  const cronBad = await fetch(`${BASE}/api/cron/reservations`, { headers: { Authorization: "Bearer wrong" } });
  const cronOk = await fetch(`${BASE}/api/cron/reservations`, { headers: { Authorization: "Bearer demo-cron" } });
  const hb = await api("/api/executive/reservations", { cookie: COMMAND });
  check("cron: refused without / with a wrong secret (401)", cronNo.status === 401 && cronBad.status === 401);
  check("cron: runs with the secret and the heartbeat shows the cron run", cronOk.status === 200 && Boolean(hb.data.heartbeat.lastCronRun));

  { // round 4 block (own scope)
  // --- round 4: cron authorization, retry safety, heartbeat, no secret exposure ---
  const cronTry = (path, headers = {}) => fetch(`${BASE}${path}`, { headers }).then(async (r) => ({ status: r.status, text: await r.text() }));
  for (const path of ["/api/cron/reservations", "/api/cron/subscriptions"]) {
    const variants = await Promise.all([
      cronTry(path),                                                   // no credentials
      cronTry(path, { Authorization: "Bearer " }),                     // empty bearer
      cronTry(path, { Authorization: "Bearer wrong" }),                // wrong secret
      cronTry(path, { Authorization: "demo-cron" }),                   // secret without the scheme
      cronTry(path, { Authorization: "Basic demo-cron" }),             // wrong scheme
      cronTry(path, { Authorization: "Bearer demo-cron-extra" }),      // prefix match is not enough
      cronTry(path, { Authorization: "Bearer DEMO-CRON" }),            // case matters
      cronTry(`${path}?secret=demo-cron`),                             // secret in the query string
      cronTry(path, { "x-cron-secret": "demo-cron" }),                 // secret in another header
      cronTry(path, { Cookie: COMMAND }),                              // an executive session is not a cron credential
    ]);
    check(`cron ${path}: every missing / malformed / wrong credential → 401, body has no secret`,
      variants.every((v) => v.status === 401 && !v.text.includes("demo-cron")), variants.map((v) => v.status).join(","));
  }
  const subOk = await cronTry("/api/cron/subscriptions", { Authorization: "Bearer demo-cron" });
  check("cron /api/cron/subscriptions: runs with the secret (200), response has no secret", subOk.status === 200 && !subOk.text.includes("demo-cron"), String(subOk.status));
  // Heartbeat: two back-to-back authorized runs are both recorded. (Retry safety with a real expired hold is in PART B:
  // only the crypto methods hold stock at checkout, and they need the local simulation.)
  const runs0 = (await one("SELECT count(*)::int AS n FROM job_runs WHERE job = 'reservation_sweep' AND source = 'cron'")).n;
  const [cr1, cr2] = [await cronTry("/api/cron/reservations", { Authorization: "Bearer demo-cron" }), await cronTry("/api/cron/reservations", { Authorization: "Bearer demo-cron" })];
  const runs1 = (await one("SELECT count(*)::int AS n FROM job_runs WHERE job = 'reservation_sweep' AND source = 'cron'")).n;
  check("cron: two immediate authorized runs both succeed (200)", cr1.status === 200 && cr2.status === 200);
  const hb2 = await api("/api/executive/reservations", { cookie: COMMAND });
  check("cron heartbeat: each run is recorded (2 more cron runs) and the tab shows the latest cron run as just now (well inside the 26 h stale threshold)",
    runs1 === runs0 + 2 && Date.now() - Date.parse(hb2.data.heartbeat.lastCronRun) < 120_000, JSON.stringify(hb2.data.heartbeat));
  check("cron: the secret never appears in the server log", !process.env.SERVER_LOG || !serverLog().includes("demo-cron"));

  // --- round 4: the owner-confirmed test orders are never revenue ---
  const fin = async () => (await api("/api/executive/financials", { cookie: COMMAND })).data.financials;
  const ltv = async () => (await api("/api/executive/customers", { cookie: COMMAND })).data.customers.find((c) => c.id === "demo-customer" || c.email === "buyer1@example.invalid");
  const tests = await q("SELECT id, reference, total FROM orders WHERE reference IN ('VC-E3SQJ9', 'VC-38UTPQ') ORDER BY reference");
  check("test orders present after the migration as payment cancelled", tests.length === 2 &&
    (await q("SELECT payment_status FROM orders WHERE reference IN ('VC-E3SQJ9', 'VC-38UTPQ')")).every((r) => r.payment_status === "cancelled"));
  const base = await fin(), baseLtv = await ltv();
  // Worst case for the rule: keep paid_at and payment 'cancelled' but make the legacy status NOT 'cancelled' (fulfillment
  // unfulfilled → status awaiting_payment). Revenue must still not move: paid_at alone never makes an order revenue.
  await q("UPDATE orders SET fulfillment_status = 'unfulfilled' WHERE reference IN ('VC-E3SQJ9', 'VC-38UTPQ')");
  const worst = await fin(), worstLtv = await ltv();
  // Positive control: the same orders with a CONFIRMED payment do count (proves the comparison can see them).
  await q("UPDATE orders SET payment_status = 'confirmed' WHERE reference IN ('VC-E3SQJ9', 'VC-38UTPQ')");
  const control = await fin();
  await q("UPDATE orders SET payment_status = 'cancelled', fulfillment_status = 'cancelled' WHERE reference IN ('VC-E3SQJ9', 'VC-38UTPQ')");
  const restored = await fin();
  const testTotal = tests.reduce((a, t) => a + Number(t.total), 0);
  const near = (a, b) => Math.abs(a - b) < 0.005;
  check("financials: the test orders add nothing to revenue (all-time, gross), even with their legacy status not cancelled",
    near(worst.revenue.allTime, base.revenue.allTime) && near(worst.grossRevenue, base.grossRevenue), `${base.revenue.allTime} / ${worst.revenue.allTime}`);
  check("financials: control — the same orders with a confirmed payment would add exactly their totals",
    near(control.revenue.allTime, base.revenue.allTime + testTotal), `${base.revenue.allTime} + ${testTotal} vs ${control.revenue.allTime}`);
  check("customers: lifetime value unchanged by the test orders", !baseLtv || near(worstLtv.lifetimeValue, baseLtv.lifetimeValue), baseLtv ? `${baseLtv.lifetimeValue}/${worstLtv.lifetimeValue}` : "customer not listed");
  check("financials back to baseline after restoring the test orders", near(restored.revenue.allTime, base.revenue.allTime));
  const seg = await api("/api/executive/segments", { cookie: COMMAND });
  check("customer metrics SQL (segments) runs with the payment-status exclusion", seg.status === 200, String(seg.status));
  } // end round 4 block
  const unrec = await one(`SELECT count(*)::int AS n FROM strength_inventory si WHERE si.physical_quantity <> COALESCE((SELECT sum(physical_quantity) FROM inventory_lots l WHERE l.strength_id = si.strength_id), 0)`);
  check("end state: every SKU still reconciled to its lots", unrec.n === 0);
}

if (PART === "B") {
  await ensureCustomers(14);
  const S = await strength("SERMORELIN-10MG");
  const S2 = await strength("THYMOSIN-ALPHA-1-10MG");
  const pm0 = await api("/api/executive/payment-methods", { cookie: COMMAND });
  check("simulation is on for this server (local only)", pm0.data.simulation === true);
  await setConfig({ bitcoin: true, ethereum: true, usdc: true, zelle: true, ach: true, card: true, apple_pay: true, google_pay: true, bank_transfer: true });
  const pm = await api("/api/executive/payment-methods", { cookie: COMMAND });
  check("simulation: provider methods offered only as SIMULATED", pm.data.methods.filter((m) => ["bitcoin", "ach", "card"].includes(m.id)).every((m) => m.offered && m.simulated));
  await receiveApproved(S, 5);
  const buyers = await Promise.all(Array.from({ length: 14 }, (_, i) => cookieFor(`demo-customer${i + 3}`)));

  // concurrency through the API: 14 buyers, 5 units
  const res = await Promise.all(buyers.map((c) => api("/api/orders", { method: "POST", cookie: c, body: orderBody(S, 1, "bitcoin", randomUUID()) })));
  const ok = res.filter((r) => r.status === 200);
  check("crypto checkout: 14 simultaneous buyers, 5 units → exactly 5 orders", ok.length === 5, res.map((r) => r.status).join(","));
  check("crypto checkout: the rest are told it sold out (409)", res.filter((r) => r.status === 409).length === 9);
  check("crypto checkout: no orphan orders for refused attempts", (await one("SELECT count(*)::int AS n FROM orders WHERE payment_method = 'bitcoin'")).n === 5);
  const st = await stock(S.id);
  check("crypto checkout: 5 reserved, sellable 0, physical unchanged", st.r === 5 && (await sellable(S.id)) === 0);
  const o1 = await orderByRef(ok[0].data.reference);
  const mins = (Date.parse(o1.reservation_expires_at) - Date.parse(o1.created_at)) / 60000;
  check("crypto: reservation window is the configured default (30 min)", Math.abs(mins - 30) < 0.2, mins.toFixed(2));
  const rv = await api("/api/executive/reservations", { cookie: COMMAND });
  check("reservations view: lists the 5 holds with order, SKU, lot, qty, created, expiry", rv.data.reservations.length === 5 && rv.data.reservations.every((r) => r.orderReference && r.sku === S.sku && r.lotCode && r.quantity === 1 && r.createdAt && r.expiresAt && !r.expired));
  const page = await fetch(`${BASE}/order/${o1.reference}`, { headers: { Cookie: COMMAND } }).then((r) => r.text());
  check("order page: provider method says no provider is connected, labelled simulation", /No payment provider is connected/.test(page) && /Local simulation/i.test(page));

  // provider confirmation + duplicate
  const cBad = await api(`/api/executive/orders/${o1.id}/confirm-payment`, { method: "POST", cookie: COMMAND, body: { reference: "MANUAL-1", amountReceived: Number(o1.total), receivedOn: "2026-11-18", attested: true } });
  check("confirm: an administrator can't hand-confirm a provider-verified (crypto) order (400)", cBad.status === 400);
  const sim1 = await api("/api/executive/payments/simulate", { method: "POST", cookie: COMMAND, body: { reference: o1.reference, kind: "confirmed", eventId: "btc-evt-1" } });
  const sim1b = await api("/api/executive/payments/simulate", { method: "POST", cookie: COMMAND, body: { reference: o1.reference, kind: "confirmed", eventId: "btc-evt-1" } });
  const after = await stock(S.id);
  check("simulated crypto payment: reservation committed (physical −1, reserved −1)", sim1.data.outcome === "confirmed" && after.p === st.p - 1 && after.r === 4);
  check("simulated duplicate notification: ignored", sim1b.data.outcome === "duplicate_event" && (await stock(S.id)).p === after.p);
  check("simulated payment is labelled simulated on the order", (await orderByRef(o1.reference)).payment_source === "simulated");

  // expiry: stop-the-job scenario
  const o2 = await orderByRef(ok[1].data.reference);
  await q("UPDATE inventory_allocations SET expires_at = '2000-01-01T00:00:00.000Z' WHERE order_id = $1", [o2.id]);
  await q("UPDATE orders SET reservation_expires_at = '2000-01-01T00:00:00.000Z' WHERE id = $1", [o2.id]);
  const rv2 = await api("/api/executive/reservations", { cookie: COMMAND });
  check("stuck reservation: flagged as expired-not-released in the view", rv2.data.reservations.find((r) => r.orderId === o2.id)?.expired === true);
  check("stuck reservation: shop already counts it as free (sellable 1 before any sweep)", (await sellable(S.id)) === 1);
  {
    const page = await (await fetch(`${BASE}/shop/${S.product_slug}`, { headers: { Cookie: `${BUYER}; vericert_age_ack=1` } })).text();
    check("product page (before any sweep): availability already counts the expired hold — not Out of Stock", /schema\.org\/(InStock|LimitedAvailability)/.test(page) && /Add to Cart/.test(page));
    const inv = (await api(`/api/executive/inventory/${S.id}`, { cookie: COMMAND })).data.row;
    check("Stock tab Available (before any sweep) counts the expired hold as free; stored Reserved still shows it", inv.available === inv.physical - inv.reserved + 1 && inv.expiredHolds === 1, JSON.stringify({ p: inv.physical, r: inv.reserved, a: inv.available }));
    const still = await one("SELECT state FROM inventory_allocations WHERE order_id = $1", [o2.id]);
    check("…and nothing was released by reading (no write on page load)", still.state === "reserved");
  }
  const buy = await api("/api/orders", { method: "POST", cookie: BUYER, body: orderBody(S, 1, "bitcoin", randomUUID()) });
  check("checkout releases the stuck hold and sells the unit (no oversell)", buy.status === 200 && (await orderByRef(o2.reference)).payment_status === "expired" && (await stock(S.id)).r === 4);
  const late = await api("/api/executive/payments/simulate", { method: "POST", cookie: COMMAND, body: { reference: o2.reference, kind: "confirmed", eventId: "btc-late-1" } });
  const o2b = await orderByRef(o2.reference);
  check("late payment after expiry → review, nothing deducted", late.data.outcome === "late_payment" && o2b.nr === "true" && (await stock(S.id)).p === after.p);
  // manual release
  const o3 = await orderByRef(ok[2].data.reference);
  const a3 = await one("SELECT id FROM inventory_allocations WHERE order_id = $1 AND state = 'reserved'", [o3.id]);
  const rel0 = await api(`/api/executive/reservations/${a3.id}/release`, { method: "POST", cookie: COMMAND, body: { reason: "" } });
  const rel = await api(`/api/executive/reservations/${a3.id}/release`, { method: "POST", cookie: OFFICE, body: { reason: "customer abandoned" } });
  const mv = await one("SELECT actor, reason FROM inventory_movements WHERE idempotency_key = $1", [`alloc:${a3.id}:released`]);
  check("manual release: reason required (400)", rel0.status === 400);
  check("manual release: released, movement has the administrator and reason", rel.status === 200 && mv.actor === "admin:office@example.invalid" && /customer abandoned/.test(mv.reason));
  const rel2 = await api(`/api/executive/reservations/${a3.id}/release`, { method: "POST", cookie: OFFICE, body: { reason: "again" } });
  check("manual release twice → 409, nothing more released", rel2.status === 409);
  // order page sweep
  const o4 = await orderByRef(ok[3].data.reference);
  await q("UPDATE inventory_allocations SET expires_at = '2000-01-01T00:00:00.000Z' WHERE order_id = $1", [o4.id]);
  await q("UPDATE orders SET reservation_expires_at = '2000-01-01T00:00:00.000Z' WHERE id = $1", [o4.id]);
  const poll = await api(`/api/orders/${o4.reference}/status`);
  check("customer's order-status poll releases its own expired hold", poll.data.status === "expired" && (await orderByRef(o4.reference)).payment_status === "expired");
  // cron sweep
  const o5 = await orderByRef(ok[4].data.reference);
  await q("UPDATE inventory_allocations SET expires_at = '2000-01-01T00:00:00.000Z' WHERE order_id = $1", [o5.id]);
  const cron = await fetch(`${BASE}/api/cron/reservations`, { headers: { Authorization: "Bearer demo-cron" } }).then((r) => r.json());
  check("cron sweep releases the remaining expired hold", cron.released >= 1 && (await orderByRef(o5.reference)).payment_status === "expired");
  // Round 4 — retry safety: an immediate retry (e.g. Vercel re-delivering the cron call) releases nothing more.
  const o5stockAfter1 = await Promise.all((await q("SELECT DISTINCT strength_id FROM inventory_allocations WHERE order_id = $1", [o5.id])).map((r) => stock(r.strength_id)));
  const o5moves1 = (await one("SELECT count(*)::int AS n FROM inventory_movements WHERE order_id = $1 AND movement_type = 'released'", [o5.id])).n;
  const cronRetry = await fetch(`${BASE}/api/cron/reservations`, { headers: { Authorization: "Bearer demo-cron" } }).then((r) => r.json());
  const o5stockAfter2 = await Promise.all((await q("SELECT DISTINCT strength_id FROM inventory_allocations WHERE order_id = $1", [o5.id])).map((r) => stock(r.strength_id)));
  const o5moves2 = (await one("SELECT count(*)::int AS n FROM inventory_movements WHERE order_id = $1 AND movement_type = 'released'", [o5.id])).n;
  const o5allocs = await q("SELECT state FROM inventory_allocations WHERE order_id = $1", [o5.id]);
  check("cron retry safety: an immediate second run releases 0 and changes no stock",
    cronRetry.released === 0 && JSON.stringify(o5stockAfter1) === JSON.stringify(o5stockAfter2), `released ${cronRetry.released}`);
  check("cron retry safety: the expired order's hold was released exactly once (one release movement per allocation, all released)",
    o5moves1 >= 1 && o5moves2 === o5moves1 && o5moves1 === o5allocs.length && o5allocs.every((a) => a.state === "released"), `moves ${o5moves1}/${o5moves2}, allocations ${o5allocs.map((a) => a.state).join(",")}`);

  // ACH
  const sA = S2;
  await receiveApproved(sA, 10);
  const ach = await api("/api/orders", { method: "POST", cookie: buyers[0], body: orderBody(sA, 2, "ach", randomUUID()) });
  const oa = await orderByRef(ach.data.reference);
  const sa0 = await stock(sA.id);
  check("ACH: default policy holds nothing at checkout", sa0.r === 0 && oa.fulfillment_status === "unfulfilled");
  await api("/api/executive/payments/simulate", { method: "POST", cookie: COMMAND, body: { reference: oa.reference, kind: "processing", eventId: "ach-p-1" } });
  check("ACH initiated: payment processing, NOT treated as paid", (await orderByRef(oa.reference)).payment_status === "processing" && (await stock(sA.id)).p === sa0.p);
  const shipEarly = await api(`/api/executive/orders/${oa.id}/status`, { method: "PATCH", cookie: COMMAND, body: { status: "shipped", trackingNumber: "1Z" } });
  check("ACH processing: can't ship before settlement (409)", shipEarly.status === 409);
  await api("/api/executive/payments/simulate", { method: "POST", cookie: COMMAND, body: { reference: oa.reference, kind: "confirmed", eventId: "ach-s-1" } });
  check("ACH settled: confirmed, stock deducted", (await orderByRef(oa.reference)).payment_status === "confirmed" && (await stock(sA.id)).p === sa0.p - 2);
  await api(`/api/executive/orders/${oa.id}/status`, { method: "PATCH", cookie: COMMAND, body: { status: "shipped", trackingNumber: "1Z999" } });
  const sa1 = await stock(sA.id);
  await api("/api/executive/payments/simulate", { method: "POST", cookie: COMMAND, body: { reference: oa.reference, kind: "reversed", eventId: "ach-r-1", reason: "R10" } });
  const oar = await orderByRef(oa.reference);
  check("ACH returned after shipment: reversed + review, shipped stock NOT restored", oar.payment_status === "reversed" && oar.nr === "true" && (await stock(sA.id)).p === sa1.p);
  const ach2 = await api("/api/orders", { method: "POST", cookie: buyers[1], body: orderBody(sA, 1, "ach", randomUUID()) });
  const oa2 = await orderByRef(ach2.data.reference);
  await api("/api/executive/payments/simulate", { method: "POST", cookie: COMMAND, body: { reference: oa2.reference, kind: "processing", eventId: "ach2-p" } });
  await api("/api/executive/payments/simulate", { method: "POST", cookie: COMMAND, body: { reference: oa2.reference, kind: "failed", eventId: "ach2-f", reason: "R01" } });
  check("ACH failed: payment failed, nothing deducted", (await orderByRef(oa2.reference)).payment_status === "failed" && (await orderByRef(oa2.reference)).status === "payment_failed");
  await setConfig({ ach: true, bitcoin: true, card: true }, { achFulfillment: "after_initiation" });
  const ach3 = await api("/api/orders", { method: "POST", cookie: buyers[2], body: orderBody(sA, 1, "ach", randomUUID()) });
  const oa3 = await orderByRef(ach3.data.reference);
  const sa2 = await stock(sA.id);
  await api("/api/executive/payments/simulate", { method: "POST", cookie: COMMAND, body: { reference: oa3.reference, kind: "processing", eventId: "ach3-p" } });
  check("ACH 'after initiation' policy: stock allocated at initiation", (await orderByRef(oa3.reference)).fulfillment_status === "allocated" && (await stock(sA.id)).p === sa2.p - 1);
  await api("/api/executive/payments/simulate", { method: "POST", cookie: COMMAND, body: { reference: oa3.reference, kind: "failed", eventId: "ach3-f" } });
  check("ACH failed before shipment: allocated stock restored", (await stock(sA.id)).p === sa2.p);
  await setConfig({ ach: true, bitcoin: true, card: true, zelle: true });

  // cards (future processor): no hold by default; confirm deducts; failure
  const card = await api("/api/orders", { method: "POST", cookie: buyers[3], body: orderBody(sA, 1, "card", randomUUID()) });
  const oc = await orderByRef(card.data.reference);
  const sc0 = await stock(sA.id);
  check("card: no hold at checkout by default", oc.fulfillment_status === "unfulfilled" && sc0.r === 0);
  await api("/api/executive/payments/simulate", { method: "POST", cookie: COMMAND, body: { reference: oc.reference, kind: "confirmed", eventId: "card-1" } });
  check("card (simulated capture): confirmed and deducted", (await orderByRef(oc.reference)).fulfillment_status === "allocated" && (await stock(sA.id)).p === sc0.p - 1);
  const card2 = await api("/api/orders", { method: "POST", cookie: buyers[4], body: orderBody(sA, 1, "card", randomUUID()) });
  await api("/api/executive/payments/simulate", { method: "POST", cookie: COMMAND, body: { reference: card2.data.reference, kind: "failed", eventId: "card-2" } });
  check("card (simulated decline): payment failed", (await orderByRef(card2.data.reference)).payment_status === "failed");
  const simZ = await api("/api/executive/payments/simulate", { method: "POST", cookie: COMMAND, body: { reference: "VC-LEG001", kind: "confirmed", eventId: "z-1" } });
  check("simulator refuses human-verified methods (bank transfer/Zelle) (400)", simZ.status === 400);
  const unrec = await one(`SELECT count(*)::int AS n FROM strength_inventory si WHERE si.physical_quantity <> COALESCE((SELECT sum(physical_quantity) FROM inventory_lots l WHERE l.strength_id = si.strength_id), 0)
                              OR si.reserved_quantity <> COALESCE((SELECT sum(reserved_quantity) FROM inventory_lots l WHERE l.strength_id = si.strength_id), 0)`);
  check("end state: every SKU reconciled; no negative stock", unrec.n === 0 && (await one("SELECT count(*)::int AS n FROM inventory_lots WHERE physical_quantity < 0 OR reserved_quantity > physical_quantity")).n === 0);
}

console.log(`\n[${PART}] ${pass} passed, ${fail} failed (${pass + fail} checks)${failures.length ? `\nFAILED: ${failures.join(" | ")}` : ""}`);
await pool.end();
process.exit(fail ? 1 : 0);
