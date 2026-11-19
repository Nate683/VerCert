// LOCAL TEST POSTGRES ONLY. Stage 3 inventory/order engine tests: calls the vc_* database functions directly over a
// pool of real connections (so concurrency is real), starting from the post-migration snapshot.
//   node db-snapshot.mjs restore post3 && node t-engine.mjs
import pg from "pg";
import { randomUUID } from "crypto";
const pool = new pg.Pool({ host: "127.0.0.1", port: 5491, user: "demo", password: "demo", database: "demo", max: 30 });
const q = async (text, params = []) => (await pool.query(text, params)).rows;
const one = async (text, params) => (await q(text, params))[0];
let pass = 0, fail = 0;
const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok });
  if (ok) pass++; else fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
}
async function throws(fn, re) {
  try { await fn(); return { ok: false, msg: "did not throw" }; }
  catch (e) { return { ok: re ? re.test(e.message) || re.test(e.code ?? "") : true, msg: `${e.code} ${e.message}` }; }
}

const strength = async (sku) => one("SELECT s.id, s.sku, s.product_slug, s.label, p.name FROM product_strengths s JOIN products p ON p.slug = s.product_slug WHERE s.sku = $1", [sku]);
const stock = async (sid) => one("SELECT physical_quantity::int AS p, reserved_quantity::int AS r FROM strength_inventory WHERE strength_id = $1", [sid]);
const lot = async (id) => one("SELECT * , physical_quantity::int AS p, reserved_quantity::int AS r FROM inventory_lots WHERE id = $1", [id]);
const order = async (id) => one("SELECT *, needs_review::text AS nr FROM orders WHERE id = $1", [id]);
const allocs = async (oid) => q("SELECT *, quantity::int AS qn FROM inventory_allocations WHERE order_id = $1 ORDER BY line_index, created_at", [oid]);
const sellable = async (sid) => Number((await one(
  `SELECT COALESCE(SUM(physical_quantity - reserved_quantity), 0) AS n FROM inventory_lots WHERE strength_id = $1 AND vc_lot_eligible(release_status, testing_status, expires_on)`, [sid])).n);

async function receive(sid, qty, { approve = true, receivedAt } = {}) {
  const r = await one("SELECT vc_lot_receive($1, $2, 'MFR-' || $3, NULL, $4, NULL, NULL, NULL, 'test:engine', $3) AS r", [sid, qty, randomUUID().slice(0, 8), receivedAt ?? null]);
  const id = r.r.lot_id;
  if (approve) await q("SELECT vc_lot_update($1, 'approved', 'passed', NULL, $3, NULL, NULL, NULL, NULL, 'test:engine', $2)", [id, randomUUID(), `VC-ENG-${randomUUID().slice(0, 8)}`]);
  return id;
}
const customer = JSON.stringify({ firstName: "T", lastName: "E", email: "engine@example.invalid", address: "1 St", city: "X", state: "TX", postalCode: "75001", country: "US" });
const insertSql = `INSERT INTO orders (id, reference, created_at, status, payment_method, customer_id, customer, items, subtotal, total)
                   VALUES ($1, $2, $3, 'awaiting_payment', $4, 'demo-customer', $5, $6, $7, $7)`;
function orderRow(lines, method) {
  const id = randomUUID();
  const ref = "VC-T" + randomUUID().slice(0, 6).toUpperCase();
  const items = lines.map(([s, n]) => ({ slug: s.product_slug, name: s.name, sizeLabel: s.label, strengthId: s.id, sku: s.sku, priceUsd: 10, quantity: n }));
  const total = items.reduce((a, i) => a + i.priceUsd * i.quantity, 0);
  return { id, ref, params: [id, ref, new Date().toISOString(), method, customer, JSON.stringify(items), total], total };
}
// Checkout for a reserving method: the INSERT and the reservation in one transaction (as the app does).
async function reserveOrder(lines, minutes = 30) {
  const o = orderRow(lines, "bitcoin");
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    await c.query(insertSql, o.params);
    await c.query("SELECT vc_order_reserve($1, $2, 'customer:demo-customer')", [o.id, new Date(Date.now() + minutes * 60000).toISOString()]);
    await c.query("COMMIT");
    return o;
  } catch (e) { await c.query("ROLLBACK"); throw e; } finally { c.release(); }
}
async function plainOrder(lines, method = "zelle") { const o = orderRow(lines, method); await q(insertSql, o.params); return o; }
const confirm = (oid, { ref = randomUUID().slice(0, 10), amount = null, exact = false, source = "admin", provider = null, eventId = null, reserve = false } = {}) =>
  one("SELECT vc_order_confirm_payment($1, 'admin:command@example.invalid', $2, $3, $4, CURRENT_DATE, NULL, $5, $6, $7, $8) AS r",
    [oid, source, ref, amount, exact, provider, eventId, reserve]).then((x) => x.r);

const S1 = await strength("TB-500-10MG");
const S2 = await strength("SEMAX-11MG");
const S3 = await strength("SS-31-10MG");
const S4 = await strength("TESAMORELIN-10MG");

// 1. Migration state
{
  const r = await one(`SELECT count(*)::int AS lots, count(*) FILTER (WHERE release_status = 'quarantined')::int AS quarantined,
                              count(*) FILTER (WHERE release_status = 'approved')::int AS approved FROM inventory_lots WHERE kind = 'reconciliation'`);
  check("migration: 34 reconciliation lots, all quarantined, none approved", r.lots === 34 && r.quarantined === 34 && r.approved === 0, JSON.stringify(r));
  check("migration: sellable = 0 while only the reconciliation lot exists", (await sellable(S1.id)) === 0);
  const st = await stock(S1.id); const recon = await one("SELECT physical_quantity::int AS p FROM inventory_lots WHERE strength_id = $1 AND kind = 'reconciliation'", [S1.id]);
  check("migration: SKU physical = reconciliation lot physical", st.p === recon.p, `${st.p} vs ${recon.p}`);
  const leg5 = await one("SELECT status, payment_status, fulfillment_status FROM orders WHERE reference = 'VC-LEG005'");
  check("migration: Stage 2 refunded-paid order mapped to refunded/cancelled", leg5.payment_status === "refunded" && leg5.fulfillment_status === "cancelled" && leg5.status === "cancelled");
  const leg3 = await one("SELECT status, payment_status, fulfillment_status FROM orders WHERE reference = 'VC-LEG003'");
  check("migration: shipped order keeps status shipped", leg3.status === "shipped" && leg3.fulfillment_status === "shipped");
}

// 2. Unapproved lots are excluded
{
  const pending = await receive(S1.id, 10, { approve: false });
  const t = await throws(() => reserveOrder([[S1, 1]]), /P0003|Not enough/);
  check("FIFO excludes a pending (unapproved) lot", t.ok, t.msg);
  await q("SELECT vc_lot_update($1, 'quarantined', NULL, NULL, NULL, NULL, NULL, NULL, 'test', 'test:engine', $2)", [pending, randomUUID()]);
  check("a quarantined lot is excluded", (await sellable(S1.id)) === 0);
  const d4 = await throws(() => q("SELECT vc_lot_update($1, 'approved', 'passed', NULL, NULL, NULL, NULL, NULL, 'tested and passed in full', 'test:engine', $2)", [pending, randomUUID()]), /without a VeriCert lot number/);
  check("D4: a lot without a VeriCert lot number can't be approved, even after passing testing", d4.ok, d4.msg);
  check("D4: …and it stays unapproved (still quarantined)", (await lot(pending)).release_status === "quarantined");
  const t2 = await throws(() => q("SELECT vc_lot_update($1, 'approved', 'untested', NULL, 'VC-ENG-X', NULL, NULL, NULL, 'short', 'test:engine', $2)", [pending, randomUUID()]), /justification/);
  check("approving an untested lot without a justification is refused", t2.ok, t2.msg);
  const t3 = await throws(() => q("SELECT vc_lot_update($1, 'approved', 'failed', NULL, NULL, NULL, NULL, NULL, 'long enough reason here', 'test:engine', $2)", [pending, randomUUID()]), /failed testing/);
  check("a lot that failed testing can never be approved", t3.ok, t3.msg);
  await q("SELECT vc_lot_update($1, 'rejected', 'failed', NULL, NULL, NULL, NULL, NULL, 'failed purity', 'test:engine', $2)", [pending, randomUUID()]);
  check("a rejected lot is excluded", (await sellable(S1.id)) === 0);
  const recon = await one("SELECT id FROM inventory_lots WHERE strength_id = $1 AND kind = 'reconciliation'", [S1.id]);
  const t4 = await throws(() => q("SELECT vc_lot_update($1, 'approved', NULL, NULL, 'VC-RECON-X', NULL, NULL, NULL, 'ok', 'test:engine', $2)", [recon.id, randomUUID()]), /justification/);
  check("approving the reconciliation lot needs a written justification", t4.ok, t4.msg);
  const t4b = await throws(() => q("SELECT vc_lot_update($1, 'approved', NULL, NULL, NULL, NULL, NULL, NULL, 'a long written justification', 'test:engine', $2)", [recon.id, randomUUID()]), /without a VeriCert lot number/);
  check("D4: the reconciliation lot can't be approved without a VeriCert lot number either, even with a justification", t4b.ok, t4b.msg);
}

// 3. FIFO across lots, reservation bookkeeping
let fifoOrder;
{
  const old = await receive(S2.id, 3, { receivedAt: "2026-01-01T00:00:00.000Z" });
  const newer = await receive(S2.id, 10, { receivedAt: "2026-06-01T00:00:00.000Z" });
  const before = await stock(S2.id);
  fifoOrder = await reserveOrder([[S2, 5]]);
  const a = await allocs(fifoOrder.id);
  check("FIFO: oldest lot used first, then the next (3 + 2)", a.length === 2 && a[0].lot_id === old && a[0].qn === 3 && a[1].lot_id === newer && a[1].qn === 2,
    a.map((x) => `${x.lot_code}:${x.qn}`).join(","));
  const after = await stock(S2.id);
  check("reservation: SKU reserved +5, physical unchanged", after.r === before.r + 5 && after.p === before.p);
  check("reservation: lot reserved counts updated", (await lot(old)).r === 3 && (await lot(newer)).r === 2);
  check("reservation: sellable reduced by 5", (await sellable(S2.id)) === 13 - 5);
  const o = await order(fifoOrder.id);
  check("reservation: order fulfillment 'reserved', status awaiting_payment, expiry set", o.fulfillment_status === "reserved" && o.status === "awaiting_payment" && Boolean(o.reservation_expires_at));
  const mv = await q("SELECT movement_type, lot_id, reserved_change::int AS rc FROM inventory_movements WHERE order_id = $1", [fifoOrder.id]);
  check("reservation: one 'reserved' movement per lot with the order id", mv.length === 2 && mv.every((m) => m.movement_type === "reserved"));
  const again = await one("SELECT vc_order_reserve($1, $2, 'x') AS n", [fifoOrder.id, new Date(Date.now() + 60000).toISOString()]);
  check("reservation is idempotent (second call reserves nothing)", again.n === 0 && (await stock(S2.id)).r === after.r);
}

// 4. Commit after payment
{
  const before = await stock(S2.id);
  const r = await confirm(fifoOrder.id, { source: "simulated", provider: "sim-btc", eventId: "evt-1", reserve: true });
  check("crypto confirm: outcome confirmed", r.outcome === "confirmed", JSON.stringify(r));
  const after = await stock(S2.id);
  check("commit: physical −5 and reserved −5 together", after.p === before.p - 5 && after.r === before.r - 5);
  const o = await order(fifoOrder.id);
  check("commit: payment confirmed, fulfillment allocated, status paid", o.payment_status === "confirmed" && o.fulfillment_status === "allocated" && o.status === "paid");
  const dup = await confirm(fifoOrder.id, { source: "simulated", provider: "sim-btc", eventId: "evt-1", reserve: true });
  check("duplicate provider notification ignored", dup.outcome === "duplicate_event" && (await stock(S2.id)).p === after.p);
  const dup2 = await confirm(fifoOrder.id, { source: "simulated", provider: "sim-btc", eventId: "evt-2", reserve: true });
  check("second distinct notification for a paid order changes nothing", dup2.outcome === "already_confirmed" && (await stock(S2.id)).p === after.p);
}

// 5. Multi-SKU atomicity
{
  await receive(S3.id, 4);
  const b1 = await stock(S3.id), b2 = await stock(S2.id);
  const countBefore = (await one("SELECT count(*)::int AS n FROM orders")).n;
  const t = await throws(() => reserveOrder([[S3, 2], [S2, 999]]), /P0003|Not enough/);
  const a1 = await stock(S3.id), a2 = await stock(S2.id);
  const countAfter = (await one("SELECT count(*)::int AS n FROM orders")).n;
  check("multi-SKU: one short line refuses the whole order", t.ok, t.msg);
  check("multi-SKU: nothing reserved on the line that could be filled", a1.r === b1.r && a2.r === b2.r);
  check("multi-SKU: no order row left behind", countAfter === countBefore);
}

// 6. Concurrency: 25 buyers, 6 units
{
  const S = S4;
  await receive(S.id, 6);
  const tries = await Promise.allSettled(Array.from({ length: 25 }, () => reserveOrder([[S, 1]])));
  const ok = tries.filter((t) => t.status === "fulfilled").length;
  const st = await stock(S.id);
  check("concurrency: exactly 6 of 25 concurrent 1-unit orders reserved", ok === 6, `${ok} succeeded`);
  check("concurrency: sellable 0, never negative", (await sellable(S.id)) === 0 && st.r <= st.p);
  const errs = tries.filter((t) => t.status === "rejected").map((t) => t.reason.code);
  check("concurrency: every refusal is an insufficient-stock refusal (no deadlock/other error)", errs.every((c) => c === "P0003"), [...new Set(errs)].join(","));
  // concurrent confirmations of the same order: one deduction
  const winner = (tries.find((t) => t.status === "fulfilled")).value;
  const before = await stock(S.id);
  const rs = await Promise.all(Array.from({ length: 8 }, (_, i) => confirm(winner.id, { source: "simulated", provider: "sim", eventId: `c-${i}`, reserve: true })));
  const after = await stock(S.id);
  check("concurrency: 8 simultaneous confirmations → one commit", rs.filter((r) => r.outcome === "confirmed").length === 1 && after.p === before.p - 1, rs.map((r) => r.outcome).join(","));
}

// 7. Expiry
{
  await receive(S1.id, 5);
  const o = await reserveOrder([[S1, 2]]);
  const before = await stock(S1.id);
  await q("UPDATE inventory_allocations SET expires_at = '2000-01-01T00:00:00.000Z' WHERE order_id = $1", [o.id]);
  const sellNow = Number((await one("SELECT COALESCE((SELECT sellable FROM vc_sellable() WHERE strength_id = $1), 0) AS n", [S1.id])).n);
  const sellRaw = await sellable(S1.id);
  check("before any sweep: shop availability (vc_sellable) already counts the expired hold as free", sellNow === sellRaw + 2, `vc_sellable ${sellNow}, raw ${sellRaw}`);
  const n = await one("SELECT vc_reservations_sweep('system:cron', 'cron') AS n");
  const after = await stock(S1.id);
  check("sweep releases the expired reservation", n.n >= 1 && after.r === before.r - 2, `released ${n.n}`);
  const od = await order(o.id);
  check("sweep marks the order expired", od.payment_status === "expired" && od.status === "expired");
  const n2 = await one("SELECT vc_reservations_sweep('system:cron', 'cron') AS n");
  check("sweep is retry-safe (second run releases nothing)", n2.n === 0 && (await stock(S1.id)).r === after.r);
  const hb = await one("SELECT count(*)::int AS n FROM job_runs WHERE job = 'reservation_sweep' AND source = 'cron'");
  check("sweep writes a heartbeat row per run", hb.n >= 2);
  // late payment
  const r = await confirm(o.id, { source: "simulated", provider: "sim", eventId: "late-1", reserve: true });
  const od2 = await order(o.id);
  check("payment after expiry → late_payment, review, nothing deducted", r.outcome === "late_payment" && od2.nr === "true" && (await stock(S1.id)).p === after.p, JSON.stringify(r));
  check("late payment: payment recorded as confirmed, fulfillment unfulfilled", od2.payment_status === "confirmed" && od2.fulfillment_status === "unfulfilled");
  // checkout-time sweep: a new order on the same strength releases other expired holds first
  const o2 = await reserveOrder([[S1, 1]]);
  await q("UPDATE inventory_allocations SET expires_at = '2000-01-01T00:00:00.000Z' WHERE order_id = $1", [o2.id]);
  const mid = await stock(S1.id);
  await reserveOrder([[S1, 1]]);
  const end = await stock(S1.id);
  check("checkout releases expired holds on the strengths it touches", end.r === mid.r, `${mid.r} → ${end.r}`);
  check("checkout-released order is marked expired", (await order(o2.id)).payment_status === "expired");
}

// 8. Zelle: no reservation; confirm deducts FIFO; insufficient → review
let zelleOrder;
{
  const before = await stock(S3.id);
  zelleOrder = await plainOrder([[S3, 2]]);
  check("zelle order: nothing reserved at creation", (await stock(S3.id)).r === before.r && (await allocs(zelleOrder.id)).length === 0);
  const mm = await confirm(zelleOrder.id, { ref: "ZEL-MISMATCH", amount: 1, exact: true });
  const om = await order(zelleOrder.id);
  check("zelle: amount mismatch refused → review, still pending, nothing deducted", mm.outcome === "amount_mismatch" && om.payment_status === "pending" && om.nr === "true" && (await stock(S3.id)).p === before.p);
  const r = await confirm(zelleOrder.id, { ref: "ZEL-REF-001", amount: zelleOrder.total, exact: true });
  const o = await order(zelleOrder.id);
  check("zelle: exact amount confirms and deducts", r.outcome === "confirmed" && (await stock(S3.id)).p === before.p - 2 && o.fulfillment_status === "allocated", JSON.stringify(r));
  check("zelle: reference, amount, administrator and time stored on the order", o.payment_reference === "ZEL-REF-001" && Number(o.payment_amount_received) === zelleOrder.total && o.payment_confirmed_by === "admin:command@example.invalid" && Boolean(o.payment_confirmed_at));
  check("zelle: confirming clears the earlier mismatch review", o.nr === "false");
  const ev = await one("SELECT details FROM order_events WHERE order_id = $1 AND event_type = 'payment_confirmed'", [zelleOrder.id]);
  check("zelle: audit event carries the reference and amount", ev?.details?.reference === "ZEL-REF-001");
  const other = await plainOrder([[S3, 1]]);
  const t = await throws(() => confirm(other.id, { ref: "zel-ref-001", amount: other.total, exact: true }), /23505|orders_payment_reference/);
  check("zelle: the same reference can't confirm a second order (case-insensitive)", t.ok, t.msg);
  const big = await plainOrder([[S3, 500]]);
  const b0 = await stock(S3.id);
  const ins = await confirm(big.id, { ref: "ZEL-BIG", amount: big.total, exact: true });
  const ob = await order(big.id);
  check("zelle: insufficient stock at confirmation → confirmed payment, review, nothing deducted", ins.outcome === "insufficient_stock" && ob.payment_status === "confirmed" && ob.nr === "true" && (await stock(S3.id)).p === b0.p, JSON.stringify(ins));
}

// 9. Void, cancel, refund, ship, return
{
  // void before shipment
  const before = await stock(S3.id);
  const v = await one("SELECT vc_order_void_payment($1, 'admin:x', 'entered the wrong order') AS r", [zelleOrder.id]);
  const o = await order(zelleOrder.id);
  check("void: restores the units to their lot", v.r.outcome === "voided" && (await stock(S3.id)).p === before.p + 2);
  check("void: order back to pending, reference cleared", o.payment_status === "pending" && o.fulfillment_status === "unfulfilled" && o.payment_reference === null);
  const ev = await one("SELECT details FROM order_events WHERE order_id = $1 AND event_type = 'payment_confirmation_voided'", [zelleOrder.id]);
  check("void: history keeps the voided reference and who confirmed it", ev?.details?.voided_reference === "ZEL-REF-001" && ev.details.originally_confirmed_by === "admin:command@example.invalid");
  const again = await confirm(zelleOrder.id, { ref: "ZEL-REF-001", amount: zelleOrder.total, exact: true });
  check("void: the freed reference can be used to re-confirm the same order", again.outcome === "confirmed");
  // ship requires tracking; ship blocked by quarantined lot
  const t1 = await throws(() => q("SELECT vc_order_advance($1, 'shipped', 'admin:x', 'USPS', '', false)", [zelleOrder.id]), /tracking/);
  check("ship: tracking number required", t1.ok, t1.msg);
  const a = (await allocs(zelleOrder.id)).find((x) => x.state === "committed");
  await q("SELECT vc_lot_update($1, 'quarantined', NULL, NULL, NULL, NULL, NULL, NULL, 'complaint', 'admin:x', $2)", [a.lot_id, randomUUID()]);
  const t2 = await throws(() => q("SELECT vc_order_advance($1, 'shipped', 'admin:x', 'USPS', '9400111', false)", [zelleOrder.id]), /no longer approved|Reallocation needed/);
  check("ship: refused when a lot it was filled from is no longer approved", t2.ok, t2.msg);
  await q("SELECT vc_lot_update($1, 'approved', NULL, NULL, NULL, NULL, NULL, NULL, 'complaint cleared after review', 'admin:x', $2)", [a.lot_id, randomUUID()]);
  await q("SELECT vc_order_advance($1, 'shipped', 'admin:x', 'USPS', '9400111', false)", [zelleOrder.id]);
  const os = await order(zelleOrder.id);
  check("ship: recorded with carrier and tracking", os.fulfillment_status === "shipped" && os.status === "shipped" && os.tracking_number === "9400111");
  const tv = await throws(() => q("SELECT vc_order_void_payment($1, 'admin:x', 'late')", [zelleOrder.id]), /before shipment/);
  check("void: refused after shipment", tv.ok, tv.msg);
  const tc = await throws(() => q("SELECT vc_order_cancel($1, 'admin:x', 'admin', 'x')", [zelleOrder.id]), /no longer be cancelled/);
  check("cancel: refused after shipment", tc.ok, tc.msg);
  // refund after shipment: no stock change
  const b = await stock(S3.id);
  const rf = await one("SELECT vc_order_refund($1, 'admin:x', 'customer_request', NULL, NULL, NULL) AS r", [zelleOrder.id]);
  check("refund after shipment: no stock restored", rf.r.after_shipment === true && (await stock(S3.id)).p === b.p);
  const t3 = await throws(() => q("SELECT vc_order_refund($1, 'admin:x', 'customer_request', NULL, NULL, NULL)", [zelleOrder.id]), /already been fully refunded/);
  check("refund: a second refund is refused", t3.ok, t3.msg);
  // returns
  const r1 = await one("SELECT vc_order_return($1, 0, $2, 1, 'sealed, undamaged', 'restock', 'admin:x', 'unopened return', $3) AS r", [zelleOrder.id, a.id, "ret-1"]);
  check("return restock: unit back into the lot it shipped from", r1.r.outcome === "recorded" && (await stock(S3.id)).p === b.p + 1);
  const r1b = await one("SELECT vc_order_return($1, 0, $2, 1, 'sealed', 'restock', 'admin:x', 'dup', $3) AS r", [zelleOrder.id, a.id, "ret-1"]);
  check("return: a repeated submission is recorded once", r1b.r.outcome === "duplicate" && (await stock(S3.id)).p === b.p + 1);
  const r2 = await one("SELECT vc_order_return($1, 0, $2, 1, 'seal broken', 'quarantine', 'admin:x', 'opened', $3) AS r", [zelleOrder.id, a.id, "ret-2"]);
  const rl = await one("SELECT physical_quantity::int AS p, release_status FROM inventory_lots WHERE strength_id = $1 AND kind = 'returns'", [S3.id]);
  check("return quarantine: unit goes to the quarantined returns lot (not sellable)", r2.r.outcome === "recorded" && rl.p === 1 && rl.release_status === "quarantined");
  const t4 = await throws(() => q("SELECT vc_order_return($1, 0, $2, 1, 'x', 'discard', 'admin:x', 'x', $3)", [zelleOrder.id, a.id, "ret-3"]), /still out/);
  check("return: can't return more than shipped", t4.ok, t4.msg);
  check("return: all units back → fulfillment returned", (await order(zelleOrder.id)).fulfillment_status === "returned");

  // cancel before payment (reserved) and twice
  await receive(S4.id, 3);
  const c = await reserveOrder([[S4, 2]]);
  const c0 = await stock(S4.id);
  const x1 = await one("SELECT vc_order_cancel($1, 'admin:x', 'admin', 'customer asked') AS r", [c.id]);
  const x2 = await one("SELECT vc_order_cancel($1, 'admin:x', 'admin', 'again') AS r", [c.id]);
  const c1 = await stock(S4.id);
  check("cancel before payment releases the hold", x1.r.released >= 1 && c1.r === c0.r - 2);
  check("cancel twice restores once", x2.r.outcome === "already_cancelled" && (await stock(S4.id)).r === c1.r);
  // cancel after payment then refund
  const p = await plainOrder([[S4, 1]]);
  await confirm(p.id, { ref: "ZEL-P-1", amount: p.total, exact: true });
  const p0 = await stock(S4.id);
  const xc = await one("SELECT vc_order_cancel($1, 'admin:x', 'admin', 'oos') AS r", [p.id]);
  const po = await order(p.id);
  check("cancel after payment restores stock to the lot and flags the refund", xc.r.restored === 1 && (await stock(S4.id)).p === p0.p + 1 && po.nr === "true");
  await q("SELECT vc_order_refund($1, 'admin:x', 'other', NULL, NULL, NULL)", [p.id]);
  const pr = await order(p.id);
  check("refund after cancel: no second restore, review cleared", (await stock(S4.id)).p === p0.p + 1 && pr.nr === "false" && pr.payment_status === "refunded");
  // refund before fulfillment
  const f = await plainOrder([[S4, 1]]);
  await confirm(f.id, { ref: "ZEL-F-1", amount: f.total, exact: true });
  const f0 = await stock(S4.id);
  const fr = await one("SELECT vc_order_refund($1, 'admin:x', 'customer_request', NULL, NULL, NULL) AS r", [f.id]);
  const fo = await order(f.id);
  check("refund before fulfillment: cancels and restores stock", fr.r.after_shipment === false && (await stock(S4.id)).p === f0.p + 1 && fo.fulfillment_status === "cancelled");
}

// 10. Admin release, ACH, legacy orders, reconciliation, append-only
{
  await receive(S2.id, 4);
  const o = await reserveOrder([[S2, 2]]);
  const a = (await allocs(o.id))[0];
  const b = await stock(S2.id);
  const t = await throws(() => q("SELECT vc_allocation_release($1, 'admin:x', '')", [a.id]), /reason/);
  check("manual release: reason required", t.ok, t.msg);
  const r = await one("SELECT vc_allocation_release($1, 'admin:command@example.invalid', 'customer abandoned checkout') AS r", [a.id]);
  const mv = await one("SELECT actor, reason FROM inventory_movements WHERE idempotency_key = $1", [`alloc:${a.id}:released`]);
  check("manual release: hold released with actor and reason in the movement", r.r.outcome === "released" && (await stock(S2.id)).r === b.r - a.qn && mv.actor === "admin:command@example.invalid" && /customer abandoned/.test(mv.reason));
  const r2 = await one("SELECT vc_allocation_release($1, 'admin:x', 'again please') AS r", [a.id]);
  check("manual release twice: second is a no-op", r2.r.outcome === "not_reserved");

  // ACH
  const ach = await plainOrder([[S2, 1]], "ach");
  await q("SELECT vc_order_payment_update($1, 'processing', 'provider:sim-ach', 'simulated', 'sim-ach', 'ach-1', '{}')", [ach.id]);
  check("ACH: initiation → payment processing, not confirmed", (await order(ach.id)).payment_status === "processing");
  const tsh = await throws(() => q("SELECT vc_order_allocate_now($1, 'system:x', false)", [ach.id]), /after payment is confirmed/);
  check("ACH: no stock allocated while processing (default policy)", tsh.ok, tsh.msg);
  await q("SELECT vc_order_payment_update($1, 'failed', 'provider:sim-ach', 'simulated', 'sim-ach', 'ach-2', '{\"reason\":\"R01\"}')", [ach.id]);
  check("ACH: failed → payment failed", (await order(ach.id)).payment_status === "failed");
  const ach2 = await plainOrder([[S2, 1]], "ach");
  await q("SELECT vc_order_payment_update($1, 'processing', 'p', 'simulated', 'sim-ach', 'ach-3', '{}')", [ach2.id]);
  const s0 = await stock(S2.id);
  await confirm(ach2.id, { source: "simulated", provider: "sim-ach", eventId: "ach-4" });
  await q("SELECT vc_order_advance($1, 'shipped', 'admin:x', 'UPS', '1Z', false)", [ach2.id]);
  const s1 = await stock(S2.id);
  await q("SELECT vc_order_payment_update($1, 'reversed', 'p', 'simulated', 'sim-ach', 'ach-5', '{\"reason\":\"R10 returned\"}')", [ach2.id]);
  const oa = await order(ach2.id);
  check("ACH: settled → stock deducted", s1.p === s0.p - 1);
  check("ACH: return after shipment → reversed + review, stock NOT restored", oa.payment_status === "reversed" && oa.nr === "true" && (await stock(S2.id)).p === s1.p);
  const dupA = await one("SELECT vc_order_payment_update($1, 'reversed', 'p', 'simulated', 'sim-ach', 'ach-5', '{}') AS r", [ach2.id]);
  check("ACH: duplicate return notification ignored", dupA.r.outcome === "duplicate_event");

  // legacy paid order cancel → reconciliation lot, idempotent with Stage 2 key
  const leg = await one("SELECT id FROM orders WHERE reference = 'VC-LEG002'");
  const legS = await one("SELECT (items::jsonb->0->>'strengthId') AS sid FROM orders WHERE reference = 'VC-LEG002'");
  const recon0 = await one("SELECT physical_quantity::int AS p FROM inventory_lots WHERE strength_id = $1 AND kind = 'reconciliation'", [legS.sid]);
  await q("SELECT vc_order_cancel($1, 'admin:x', 'admin', 'legacy test')", [leg.id]);
  const recon1 = await one("SELECT physical_quantity::int AS p, release_status FROM inventory_lots WHERE strength_id = $1 AND kind = 'reconciliation'", [legS.sid]);
  check("pre-Stage-3 paid order: cancel restores into the quarantined reconciliation lot", recon1.p === recon0.p + 2 && recon1.release_status === "quarantined");
  const mvk = await one("SELECT count(*)::int AS n FROM inventory_movements WHERE idempotency_key = 'order:VC-LEG002:0:restored'");
  check("pre-Stage-3 restore uses the Stage 2 key (never twice)", mvk.n === 1);

  // reconciliation trigger
  const t5 = await throws(() => q("UPDATE strength_inventory SET physical_quantity = physical_quantity + 1 WHERE strength_id = $1", [S1.id]), /inventory_unreconciled/);
  check("database refuses a SKU total that doesn't match its lots", t5.ok, t5.msg);
  const t6 = await throws(() => q("UPDATE inventory_lots SET reserved_quantity = reserved_quantity + 1 WHERE strength_id = $1 AND kind = 'reconciliation'", [S1.id]), /inventory_unreconciled|reserved/);
  check("database refuses a lot reservation with no allocation behind it", t6.ok, t6.msg);
  const t7 = await throws(() => q("DELETE FROM inventory_movements WHERE id = (SELECT id FROM inventory_movements LIMIT 1)"), /append-only/);
  const t8 = await throws(() => q("UPDATE order_events SET actor = 'x' WHERE id = (SELECT id FROM order_events LIMIT 1)"), /append-only/);
  const t9 = await throws(() => q("DELETE FROM inventory_lots WHERE id = (SELECT id FROM inventory_lots LIMIT 1)"), /append-only/);
  check("movement history, order history and lots can't be deleted/edited", t7.ok && t8.ok && t9.ok, [t7.msg, t8.msg, t9.msg].join(" | "));

  // split + count
  const recon = await one("SELECT id, physical_quantity::int AS p FROM inventory_lots WHERE strength_id = $1 AND kind = 'reconciliation'", [S1.id]);
  const sk0 = await stock(S1.id);
  const sp = await one("SELECT vc_lot_split($1, 10, 'MFR-REAL-1', 'VC-LOT-77', NULL, NULL, NULL, NULL, 'admin:x', 'batch label found', $2) AS r", [recon.id, "split-1"]);
  const sk1 = await stock(S1.id);
  const nl = await lot(sp.r.lot_id);
  check("split: SKU total unchanged, units moved into a new pending lot", sk1.p === sk0.p && nl.p === 10 && (await lot(recon.id)).p === recon.p - 10 && nl.release_status === "pending");
  const sp2 = await one("SELECT vc_lot_split($1, 10, 'MFR-REAL-1', NULL, NULL, NULL, NULL, NULL, 'admin:x', 'batch label found', $2) AS r", [recon.id, "split-1"]);
  check("split: repeated submission moves nothing", sp2.r.outcome === "duplicate" && (await lot(recon.id)).p === recon.p - 10);
  const t10 = await throws(() => q("SELECT vc_lot_adjust($1, 'count_correction', 3, $2, 'Physical count', NULL, 'admin:x', $3)", [nl.id, nl.version + 5, randomUUID()]), /changed since/);
  check("lot count with a stale version is refused", t10.ok, t10.msg);
  await q("SELECT vc_lot_adjust($1, 'count_correction', 8, $2, 'Physical count', NULL, 'admin:x', $3)", [nl.id, nl.version, randomUUID()]);
  check("lot count: lot and SKU both move by the difference", (await lot(nl.id)).p === 8 && (await stock(S1.id)).p === sk1.p - 2);
  const t11 = await throws(() => q("SELECT vc_lot_adjust($1, 'stock_removed', 50, NULL, 'Damaged', NULL, 'admin:x', $2)", [nl.id, randomUUID()]), /available to remove/);
  check("lot removal beyond available refused; physical never negative", t11.ok, t11.msg);
  const neg = await one("SELECT count(*)::int AS n FROM inventory_lots WHERE physical_quantity < 0 OR reserved_quantity < 0 OR reserved_quantity > physical_quantity");
  const unrec = await one(`SELECT count(*)::int AS n FROM strength_inventory si WHERE si.physical_quantity <> COALESCE((SELECT sum(physical_quantity) FROM inventory_lots l WHERE l.strength_id = si.strength_id), 0)
                              OR si.reserved_quantity <> COALESCE((SELECT sum(reserved_quantity) FROM inventory_lots l WHERE l.strength_id = si.strength_id), 0)`);
  check("end state: no negative/over-reserved lot, every SKU reconciled", neg.n === 0 && unrec.n === 0);
  const status = await one("SELECT count(*)::int AS n FROM orders WHERE status <> vc_legacy_status(payment_status, fulfillment_status)");
  check("end state: every order's legacy status matches payment + fulfillment", status.n === 0);
}

// 11. Stage 3 final corrections ------------------------------------------------------------------------------------
const K = await strength("KPV-10MG");
const M = await strength("MOTS-C-10MG");
const N = await strength("NAD-PLUS-500MG");
const D = await strength("DSIP-5MG");
const refund = (oid, amount, key) => one("SELECT vc_order_refund($1, 'admin:x', 'customer_request', $2::numeric, NULL, $3) AS r", [oid, amount, key]).then((x) => x.r);
const refunds = (oid) => q("SELECT amount::float AS a, cumulative_after::float AS c FROM order_refunds WHERE order_id = $1 ORDER BY created_at, cumulative_after", [oid]);

// Partial refunds: several partials, an over-refund refused, a duplicate ignored, then the completing refund.
{
  await receive(K.id, 10);
  const o = await plainOrder([[K, 2]]);           // total 20
  await confirm(o.id, { ref: "ZEL-PR-1", amount: o.total, exact: true });
  const s0 = await stock(K.id);
  const r1 = await refund(o.id, 5, "pr-1");
  const o1 = await order(o.id);
  check("partial refund: payment 'partially_refunded', refund_amount 5, not marked fully refunded", r1.outcome === "partially_refunded" && Number(o1.refund_amount) === 5 && o1.refunded_at === null && o1.payment_status === "partially_refunded");
  check("partial refund: no stock change, order still allocated (status paid)", (await stock(K.id)).p === s0.p && o1.fulfillment_status === "allocated" && o1.status === "paid");
  const dup = await refund(o.id, 5, "pr-1");
  check("partial refund: the same submission twice is recorded once", dup.outcome === "duplicate" && Number((await order(o.id)).refund_amount) === 5);
  const r2 = await refund(o.id, 10, "pr-2");
  check("second partial refund: cumulative 15, remaining 5", r2.outcome === "partially_refunded" && Number(r2.refunded_total) === 15 && Number(r2.remaining) === 5);
  const over = await throws(() => refund(o.id, 10, "pr-3"), /more than the 20.00 paid/);
  check("refund beyond what was paid is refused, nothing changed", over.ok && Number((await order(o.id)).refund_amount) === 15, over.msg);
  const r3 = await refund(o.id, null, "pr-4");
  const o3 = await order(o.id);
  check("completing refund (blank = remaining 5): fully refunded", r3.outcome === "refunded" && Number(r3.amount) === 5 && Number(o3.refund_amount) === 20 && o3.refunded_at !== null && o3.payment_status === "refunded");
  check("completing refund before shipment cancels and restores stock (+2) exactly once", (await stock(K.id)).p === s0.p + 2 && o3.fulfillment_status === "cancelled");
  const rows = await refunds(o.id);
  check("refund history: 3 rows (5, 10, 5), cumulative 5 → 15 → 20", rows.length === 3 && rows.map((r) => r.c).join(",") === "5,15,20");
  const again = await throws(() => refund(o.id, 1, "pr-5"), /already been fully refunded/);
  check("no refund after a full refund", again.ok);
  const ro = await throws(() => q("UPDATE order_refunds SET amount = 1 WHERE order_id = $1", [o.id]), /append-only/);
  check("refund history is append-only", ro.ok);
  // shipped: partials then full, never any stock change
  const sh = await plainOrder([[K, 1]]);
  await confirm(sh.id, { ref: "ZEL-PR-SH", amount: sh.total, exact: true });
  await q("SELECT vc_order_advance($1, 'shipped', 'admin:x', 'USPS', 'T1', false)", [sh.id]);
  const s1 = await stock(K.id);
  await refund(sh.id, 3, "prs-1");
  await refund(sh.id, 3, "prs-2");
  const rs = await refund(sh.id, null, "prs-3");
  check("shipped order: partial, partial, full refund → no stock change, still shipped", rs.outcome === "refunded" && (await stock(K.id)).p === s1.p && (await order(sh.id)).fulfillment_status === "shipped");
}

// Controlled reallocation
{
  const lotA = await receive(M.id, 3, { receivedAt: "2026-01-01T00:00:00.000Z" });
  const lotB = await receive(M.id, 10, { receivedAt: "2026-06-01T00:00:00.000Z" });
  const o = await plainOrder([[M, 5]]);
  await confirm(o.id, { ref: "ZEL-RA-1", amount: o.total, exact: true });
  const a0 = await allocs(o.id);
  check("reallocation setup: order filled from two lots (3 + 2)", a0.length === 2 && a0[0].lot_id === lotA && a0[0].qn === 3);
  const sku0 = await stock(M.id);
  const qr = (await one("SELECT vc_lot_update($1, 'quarantined', NULL, NULL, NULL, NULL, NULL, NULL, 'complaint', 'admin:x', $2) AS r", [lotA, randomUUID()])).r;
  check("D5: quarantining a lot returns the orders it put on hold (so their customers can be told)", qr.orders_on_hold === 1 && qr.held_orders.includes(o.id), JSON.stringify(qr.held_orders));
  const flagged = await order(o.id);
  check("quarantining a lot puts the unshipped order it filled on hold (review: reallocation needed)", flagged.nr === "true" && /Reallocation needed: lot/.test(flagged.review_reason));
  const short = await throws(() => q("SELECT vc_order_reallocate($1, 'admin:x', 'short')", [o.id]), /at least 10/);
  check("reallocation: reason of 10+ characters required", short.ok);
  const lb0 = (await lot(lotB)).p;
  const ra = await one("SELECT vc_order_reallocate($1, 'admin:command@example.invalid', 'lot quarantined after a customer complaint') AS r", [o.id]);
  const a1 = await allocs(o.id);
  const old = a1.find((x) => x.id === a0[0].id);
  const repl = a1.filter((x) => x.replaces_allocation_id === a0[0].id);
  check("reallocation: done; the original allocation is kept as 'restored' with the reason", ra.r.outcome === "reallocated" && old.state === "restored" && /lot quarantined/.test(old.restore_reason));
  check("reallocation: replacement allocation(s) from the approved lot of the same strength, linked to the original", repl.length === 1 && repl[0].lot_id === lotB && repl[0].qn === 3 && repl[0].strength_id === M.id && repl[0].state === "committed");
  check("reallocation: quarantined lot gets its 3 units back, approved lot gives 3, SKU total unchanged",
    (await lot(lotA)).p === 3 && (await lot(lotB)).p === lb0 - 3 && (await stock(M.id)).p === sku0.p);
  const mv = await q("SELECT movement_type, actor FROM inventory_movements WHERE order_id = $1 AND movement_type IN ('reallocated_out', 'reallocated_in')", [o.id]);
  check("reallocation: recorded as reallocated_out + reallocated_in movements with the administrator", mv.length === 2 && mv.every((m) => m.actor === "admin:command@example.invalid"));
  check("reallocation: review cleared; the order can ship", (await order(o.id)).nr === "false");
  const none = await throws(() => q("SELECT vc_order_reallocate($1, 'admin:x', 'nothing to move here')", [o.id]), /still approved/);
  check("reallocation refused when every lot is approved", none.ok);
  await q("SELECT vc_order_advance($1, 'shipped', 'admin:x', 'USPS', 'T2', false)", [o.id]);
  check("order ships after reallocation", (await order(o.id)).fulfillment_status === "shipped");
  // insufficient approved stock: nothing moves, order on hold
  const lotN = await receive(N.id, 4);
  const o2 = await plainOrder([[N, 4]]);
  await confirm(o2.id, { ref: "ZEL-RA-2", amount: o2.total, exact: true });
  await q("SELECT vc_lot_update($1, 'rejected', 'failed', NULL, NULL, NULL, NULL, NULL, 'failed purity', 'admin:x', $2)", [lotN, randomUUID()]);
  const b0 = await allocs(o2.id), n0 = await stock(N.id);
  const r2 = await one("SELECT vc_order_reallocate($1, 'admin:x', 'lot rejected after retest') AS r", [o2.id]);
  const b1 = await allocs(o2.id), o2r = await order(o2.id);
  check("reallocation without enough approved stock: on hold, nothing moved",
    r2.r.outcome === "on_hold" && JSON.stringify(b0.map((x) => [x.id, x.state])) === JSON.stringify(b1.map((x) => [x.id, x.state])) && (await stock(N.id)).p === n0.p);
  check("…and the order stays in review with the reason", o2r.nr === "true" && /Reallocation needed: Not enough approved stock/.test(o2r.review_reason));
  const shipBlocked = await throws(() => q("SELECT vc_order_advance($1, 'shipped', 'admin:x', 'USPS', 'T3', false)", [o2.id]), /review|no longer approved/);
  check("…and can't be shipped", shipBlocked.ok);
  await receive(N.id, 6);
  const r3 = await one("SELECT vc_order_reallocate($1, 'admin:x', 'replacement stock received') AS r", [o2.id]);
  check("once approved stock arrives, reallocation succeeds and the hold clears", r3.r.outcome === "reallocated" && (await order(o2.id)).nr === "false");
  const shipped = await throws(() => q("SELECT vc_order_reallocate($1, 'admin:x', 'after shipment attempt')", [o.id]), /not yet shipped/);
  check("reallocation refused after shipment", shipped.ok);
}

// Reconciliation lots and lots identified by VeriCert lot number only
{
  const recon = await one("SELECT id, physical_quantity::int AS p, version::int AS v FROM inventory_lots WHERE strength_id = $1 AND kind = 'reconciliation'", [D.id]);
  const s0 = await stock(D.id);
  await q("SELECT vc_lot_adjust($1, 'count_correction', 0, $2, 'Not physically received (planned quantity)', NULL, 'admin:x', $3)", [recon.id, recon.v, randomUUID()]);
  const r1 = await lot(recon.id);
  check("reconciliation lot reduced to 0 by a count; SKU total follows; still quarantined", r1.p === 0 && (await stock(D.id)).p === s0.p - recon.p && r1.release_status === "quarantined");
  const mv = await one("SELECT movement_type, quantity_change::int AS c, reason FROM inventory_movements WHERE lot_id = $1 ORDER BY created_at DESC LIMIT 1", [recon.id]);
  check("…recorded as a count correction with its reason", mv.movement_type === "count_correction" && mv.c === -recon.p && /Not physically received/.test(mv.reason));
  const reconK = await one("SELECT id, physical_quantity::int AS p FROM inventory_lots WHERE strength_id = $1 AND kind = 'reconciliation'", [K.id]);
  await q("SELECT vc_lot_adjust($1, 'stock_removed', $2, NULL, 'Not physically received', NULL, 'admin:x', $3)", [reconK.id, reconK.p, randomUUID()]);
  check("reconciliation lot emptied by removal ('Not physically received')", (await lot(reconK.id)).p === 0);
  const r = await one("SELECT vc_lot_receive($1, 12, NULL, 'VC-2026-0042', NULL, NULL, NULL, NULL, 'admin:x', $2) AS r", [D.id, randomUUID()]);
  const nl = await lot(r.r.lot_id);
  check("a lot can be received with a VeriCert lot number and no manufacturer lot", nl.manufacturer_lot === null && nl.vericert_lot_number === "VC-2026-0042" && nl.release_status === "pending");
  check("…and is not sellable until approved", (await sellable(D.id)) === 0);
  const unrec = await one(`SELECT count(*)::int AS n FROM strength_inventory si WHERE si.physical_quantity <> COALESCE((SELECT sum(physical_quantity) FROM inventory_lots l WHERE l.strength_id = si.strength_id), 0)`);
  check("final-corrections end state: every SKU reconciled to its lots", unrec.n === 0);
}

console.log(`\n${pass} passed, ${fail} failed (${pass + fail} checks)`);
await pool.end();
process.exit(fail ? 1 : 0);
