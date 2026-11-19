// Stage 3 (checkout ↔ inventory, lots, payment states). NOT APPROVED FOR PRODUCTION: run it there only after the
// owner has approved this exact script, and BEFORE pushing the code that reads these objects.
//
//   node scripts/stage3-orders.mjs                       # dry run: read-only; prints the plan, every change, and a
//                                                        # content manifest of the catalog as it is in THIS database
//   node scripts/stage3-orders.mjs --apply               # applies everything below in one transaction
//   node scripts/stage3-orders.mjs --refresh-functions   # re-installs the functions only (CREATE OR REPLACE)
//
// It works on the database's own rows as they are when it runs. It copies no data from anywhere (no snapshot, no
// file) and it never writes products, strengths, prices, SKUs, product descriptions/CAS/formula/sequence, stock
// counts, existing movements or certificates. A GUARD INSIDE THE TRANSACTION fingerprints all of those before the
// first statement and again after the last; if anything differs, the whole migration rolls back.
//
// What it does (all in one transaction):
// - New tables: inventory_lots, inventory_allocations, order_events, order_returns, order_refunds (append-only),
//   job_runs; sequence inventory_lot_seq. Functions vc_* (scripts/stage3-sql.mjs) and triggers.
// - inventory_movements (the one ledger) gains lot/order/reserved columns and the new movement types. Its
//   append-only trigger is untouched; existing rows are not rewritten (ADD COLUMN only).
// - orders gains payment/fulfillment status and payment-confirmation, review and idempotency columns. Existing orders
//   are mapped from their status (listed in the dry run). Changes to the legacy `status` are listed one by one:
//   an order refunded before shipment under Stage 2 rules becomes 'cancelled' (Stage 2 already restored its stock).
//   A Stage 2 refund of LESS than the order total maps to payment 'partially_refunded' (listed).
// - Owner decision A1 (option 2): every strength with stock gets ONE reconciliation lot "RECON-<SKU>" holding exactly
//   its current physical quantity, QUARANTINED and untested. Nothing is approved. Sellable stock is 0 for every SKU
//   until an administrator reduces / splits / approves these.
//
// - The two owner-confirmed test orders (VC-E3SQJ9, VC-38UTPQ: cancelled, no money received) map to payment
//   'cancelled', not 'confirmed', despite the paid_at Stage 2 left on them. Their rows are otherwise unchanged.
//
// Refuses to run (dry run reports why) if: Stage 3 already exists; any strength has reserved > 0; an order has an
// unknown status; an owner-confirmed test order is no longer cancelled-without-refund; the movement-type CHECK isn't the expected name; or the BPC-157 20mg strength is ACTIVE (it must stay
// deactivated — this script will not touch it either way).
// Recovery: see VERICERT_STAGE_3_COMPLETION_REPORT.md §Rollback.
import { pathToFileURL } from "url";
import { createHash } from "crypto";
import { SCHEMA, FUNCTIONS, TRIGGERS } from "./stage3-sql.mjs";

const ORDER_COLUMNS = ["id", "reference", "created_at", "status", "payment_method", "customer_id", "customer", "items", "subtotal", "total",
  "crypto", "paid_at", "processing_at", "shipped_at", "delivered_at", "cancelled_at", "cancel_reason", "carrier", "tracking_number",
  "stock_decremented", "promo_code", "promo_code_id", "discount_amount", "free_shipping", "refunded_at", "refund_reason", "refund_amount"];
const BPC_TEST_SKU = "BPC-157-20MG";

// Everything the migration must leave exactly as it found it, as one row of md5 fingerprints. Used before/after and
// inside the transaction guard. Existing movements = every movement except the reconciliation ones this script adds.
const PROTECTED = {
  products: "SELECT md5(coalesce(string_agg(to_jsonb(p)::text, '|' ORDER BY slug), '')) FROM products p",
  product_strengths: "SELECT md5(coalesce(string_agg(to_jsonb(s)::text, '|' ORDER BY id), '')) FROM product_strengths s",
  strength_inventory: "SELECT md5(coalesce(string_agg(to_jsonb(si)::text, '|' ORDER BY strength_id), '')) FROM strength_inventory si",
  inventory_movements: `SELECT md5(coalesce(string_agg(to_jsonb(m)::text, '|' ORDER BY id), '')) FROM (SELECT id, strength_id, movement_type, quantity_change,
      previous_quantity, resulting_quantity, reason, actor, reference, idempotency_key, created_at FROM inventory_movements
      WHERE idempotency_key IS NULL OR idempotency_key NOT LIKE 'recon:%') m`,
  legacy_inventory: "SELECT md5(coalesce(string_agg(to_jsonb(i)::text, '|' ORDER BY slug, size_label), '')) FROM inventory i",
  coa_records: "SELECT md5(coalesce(string_agg(to_jsonb(r)::text, '|' ORDER BY id), '')) FROM coa_records r",
  coa_lots: "SELECT md5(coalesce(string_agg(to_jsonb(l)::text, '|' ORDER BY id), '')) FROM coa_lots l",
  coa_files: "SELECT md5(coalesce(string_agg(id || ':' || sha256, '|' ORDER BY id), '')) FROM coa_files",
  subscriptions: "SELECT md5(coalesce(string_agg(to_jsonb(x)::text, '|' ORDER BY id), '')) FROM subscriptions x",
  orders_except_status: `SELECT md5(coalesce(string_agg(to_jsonb(x)::text, '|' ORDER BY id), '')) FROM (SELECT ${ORDER_COLUMNS.filter((c) => c !== "status").map((c) => `o.${c}`).join(", ")} FROM orders o) x`,
};
const FP_SELECT = `SELECT ${Object.entries(PROTECTED).map(([k, q]) => `(${q}) AS ${k}`).join(",\n       ")}`;

async function snapshot(sql) {
  const [fp] = await sql.query(FP_SELECT);
  const [{ exists }] = await sql`SELECT to_regclass('public.inventory_lots') IS NOT NULL AS exists`;
  return { fp, exists };
}

// The guard, as the transaction's last statement: recompute every fingerprint and compare with the copy taken by the
// first statement (temp table, dropped at commit). Any difference raises, and the transaction rolls back entirely.
const GUARD_CREATE = `CREATE TEMP TABLE stage3_guard ON COMMIT DROP AS ${FP_SELECT}`;
const GUARD_CHECK = `DO $guard$
  DECLARE b record; a record; bad text[] := '{}';
  BEGIN
    SELECT * INTO b FROM stage3_guard;
    ${FP_SELECT.replace(/^SELECT /, "SELECT ")} INTO a;
    ${Object.keys(PROTECTED).map((k) => `IF a.${k} IS DISTINCT FROM b.${k} THEN bad := bad || '${k}'::text; END IF;`).join("\n    ")}
    IF cardinality(bad) > 0 THEN
      RAISE EXCEPTION 'stage3 guard: protected data changed (%); the migration was rolled back and nothing was applied', array_to_string(bad, ', ');
    END IF;
  END $guard$`;

// Owner-confirmed 2026-11-18: these two orders were the owner's own test transactions — cancelled, NO payment was
// received and no refund is owed. Stage 2's "mark paid" left a paid_at on them, so the generic rule below would read
// them as paid-then-cancelled (payment 'confirmed'). They map to payment 'cancelled' instead, with no payment
// confirmation recorded. Their own rows (paid_at included) are NOT changed — the guard still covers every Stage 2
// column — and one order_events row records why. The dry run STOPS if either is present but no longer cancelled,
// or carries a refund, so this can never reclassify a different kind of order.
const OWNER_CONFIRMED_UNPAID_TEST_ORDERS = ["VC-E3SQJ9", "VC-38UTPQ"];
const UNPAID_TEST_NOTE = "Owner-confirmed test order (2026-11-18): no payment was received and no refund is owed. Classified as payment cancelled by the Stage 3 migration; the paid_at recorded under Stage 2 is kept as it was.";

// payment_status / fulfillment_status for an existing order, from what Stage 2 recorded.
function mapOrder(o) {
  if (OWNER_CONFIRMED_UNPAID_TEST_ORDERS.includes(o.reference) && o.status === "cancelled" && !o.refunded_at) {
    return { pay: "cancelled", ful: "cancelled", unpaidTest: true };
  }
  const refunded = Boolean(o.refunded_at);
  const partial = refunded && o.refund_amount !== null && Number(o.refund_amount) < Number(o.total);
  const refundPay = partial ? "partially_refunded" : "refunded";
  const paid = Boolean(o.paid_at);
  switch (o.status) {
    case "awaiting_payment": return { pay: "pending", ful: "unfulfilled" };
    case "expired": return { pay: "expired", ful: "unfulfilled" };
    case "cancelled": return { pay: refunded ? refundPay : paid ? "confirmed" : "cancelled", ful: "cancelled" };
    // Stage 2 restored ALL stock on any refund of an unshipped order, so it can't be shown as allocated.
    case "paid": return { pay: refunded ? refundPay : "confirmed", ful: refunded ? "cancelled" : "allocated" };
    case "processing": return { pay: refunded ? refundPay : "confirmed", ful: refunded ? "cancelled" : "processing" };
    case "shipped": return { pay: refunded ? refundPay : "confirmed", ful: "shipped" };
    case "delivered": return { pay: refunded ? refundPay : "confirmed", ful: "delivered" };
    default: return null;
  }
}
const legacyStatus = (pay, ful) =>
  ful === "cancelled" ? "cancelled" : ful === "returned" ? "returned" : ful === "delivered" ? "delivered" : ful === "shipped" ? "shipped"
  : pay === "expired" ? "expired" : pay === "failed" ? "payment_failed" : ful === "processing" ? "processing"
  : ["confirmed", "partially_refunded", "refunded", "reversed"].includes(pay) ? "paid" : "awaiting_payment";

const short = (s) => createHash("sha256").update(s ?? "").digest("hex").slice(0, 12);

export async function run(sql, { apply = false, refreshFunctions = false, log: print = console.log } = {}) {
  if (refreshFunctions) {
    const [{ exists }] = await sql`SELECT to_regclass('public.inventory_lots') IS NOT NULL AS exists`;
    if (!exists) { print("Stage 3 tables don't exist yet: run with --apply first."); return { applied: false }; }
    await sql.transaction(FUNCTIONS.map((q) => sql.query(q)));
    print(`Re-installed ${FUNCTIONS.length} function statements.`);
    return { applied: true };
  }

  const before = await snapshot(sql);
  print("BEFORE fingerprints:", JSON.stringify(before.fp));
  if (before.exists) { print("Stage 3 objects already exist (inventory_lots). Nothing to do."); return { applied: false }; }

  const stock = await sql`SELECT si.strength_id, s.sku, s.product_slug, s.label, s.active, s.availability_status, s.price_usd,
                                 si.physical_quantity::int AS physical, si.reserved_quantity::int AS reserved, si.created_at
                            FROM strength_inventory si JOIN product_strengths s ON s.id = si.strength_id ORDER BY s.product_slug, s.position`;
  const products = await sql`SELECT slug, name, active, description, cas_number, molecular_formula, molecular_weight, sequence_or_form, storage,
                                    purity_percent, summary, batch_numbers, sizes FROM products ORDER BY slug`;
  const orders = await sql`SELECT id, reference, status, payment_method, paid_at, refunded_at, refund_amount, total, stock_decremented, created_at FROM orders ORDER BY created_at`;
  const [bpc] = await sql.query("SELECT id, active FROM product_strengths WHERE upper(sku) = $1", [BPC_TEST_SKU]);
  const reservedRows = stock.filter((r) => r.reserved !== 0);
  const withStock = stock.filter((r) => r.physical > 0);
  const mapped = orders.map((o) => ({ ...o, ...mapOrder(o) }));
  const unmappable = mapped.filter((o) => !o.pay);
  const statusChanges = mapped.filter((o) => o.pay && legacyStatus(o.pay, o.ful) !== o.status);
  const partials = mapped.filter((o) => o.pay === "partially_refunded");
  const unpaidTests = mapped.filter((o) => o.unpaidTest);
  const testMisfits = OWNER_CONFIRMED_UNPAID_TEST_ORDERS.map((ref) => orders.find((o) => o.reference === ref))
    .filter((o) => o && (o.status !== "cancelled" || o.refunded_at));

  print(`\nCONTENT MANIFEST (this database, as it is now — compare with what you expect; the migration writes none of it):`);
  print(`  products: ${products.length} (${products.filter((p) => p.active).length} visible)`);
  for (const p of products) {
    print(`    ${p.slug} · ${p.active ? "visible" : "hidden"} · CAS ${p.cas_number ?? "—"} · formula ${p.molecular_formula ?? "—"} · content#${short(JSON.stringify([p.name, p.description, p.summary, p.cas_number, p.molecular_formula, p.molecular_weight, p.sequence_or_form, p.storage, p.purity_percent, p.batch_numbers]))}`);
  }
  print(`  strengths: ${stock.length} (SKU · id · label · price · active · status · physical)`);
  for (const s of stock) print(`    ${s.sku} · ${s.strength_id} · ${s.label} · ${s.price_usd ?? "unpriced"} · ${s.active ? "active" : "DEACTIVATED"} · ${s.availability_status} · ${s.physical}`);
  print(`  ${BPC_TEST_SKU}: ${bpc ? (bpc.active ? "ACTIVE (must be deactivated — STOP)" : "deactivated (left untouched)") : "not present"}`);

  print(`\nPLAN:`);
  print(`  1. create inventory_lots, inventory_allocations, order_events, order_returns, order_refunds, job_runs, inventory_lot_seq (+ indexes)`);
  print(`  2. inventory_movements: add nullable/defaulted columns, widen the movement_type CHECK, add 2 arithmetic CHECKs, 2 indexes (no row rewritten)`);
  print(`  3. orders: add columns + CHECKs + indexes; map ${orders.length} existing order(s) to payment/fulfillment status`);
  print(`  4. install ${FUNCTIONS.length} function statements and ${TRIGGERS.length} triggers (status derivation, deferred reconciliation, append-only)`);
  print(`  5. owner decision A1 (option 2): ${withStock.length} reconciliation lot(s) RECON-<SKU>, QUARANTINED, untested, holding each strength's current physical quantity`);
  print(`  6. in-transaction guard over: ${Object.keys(PROTECTED).join(", ")} — any change rolls everything back`);
  print(`\nreconciliation lots (sku · active · units):`);
  for (const r of withStock) print(`  RECON-${r.sku} · ${r.active ? "active" : "DEACTIVATED"} · ${r.physical}`);
  print(`  total units moved into quarantined reconciliation lots: ${withStock.reduce((a, r) => a + r.physical, 0)}; strengths at 0 (no lot): ${stock.length - withStock.length}`);
  print(`  → sellable stock after apply: 0 on every SKU until an administrator acts. Nothing is approved by this script.`);
  print(`\norder mapping (reference · status → payment / fulfillment):`);
  for (const o of mapped) print(`  ${o.reference} · ${o.status}${o.refunded_at ? ` (refunded ${o.refund_amount ?? o.total} of ${o.total})` : ""} → ${o.pay ?? "?"} / ${o.ful ?? "?"}${o.pay && legacyStatus(o.pay, o.ful) !== o.status ? `   ** status becomes ${legacyStatus(o.pay, o.ful)}` : ""}`);
  print(`  legacy status changes: ${statusChanges.length ? statusChanges.map((o) => `${o.reference} ${o.status}→${legacyStatus(o.pay, o.ful)}`).join(", ") : "none"}`);
  print(`  Stage 2 partial refunds now shown as partially refunded (net revenue counted): ${partials.length ? partials.map((o) => `${o.reference} ${o.refund_amount}/${o.total}`).join(", ") : "none"}`);
  print(`  owner-confirmed unpaid test orders → payment cancelled, no payment confirmation, not revenue (row unchanged; one order_events note each): ${unpaidTests.length ? unpaidTests.map((o) => `${o.reference}${o.paid_at ? " (Stage 2 paid_at kept)" : ""}`).join(", ") : "none present"}`);
  for (const ref of OWNER_CONFIRMED_UNPAID_TEST_ORDERS) if (!orders.some((o) => o.reference === ref)) print(`    ${ref}: not in this database`);

  // The movement-type CHECK is replaced by name. If the database named it differently, the old CHECK would survive
  // and refuse every new movement type at run time — so the name is verified before anything runs.
  const typeChecks = (await sql`SELECT conname FROM pg_constraint WHERE conrelid = 'inventory_movements'::regclass AND contype = 'c'
                                   AND pg_get_constraintdef(oid) LIKE '%movement_type%'`).map((r) => r.conname);
  print(`\nmovement-type CHECK constraint(s) found: ${typeChecks.join(", ") || "none"} (expected: inventory_movements_movement_type_check)`);
  const blockers = [
    ...(typeChecks.length !== 1 || typeChecks[0] !== "inventory_movements_movement_type_check" ? [`unexpected movement-type CHECK constraint(s): ${typeChecks.join(", ") || "none"}`] : []),
    ...(reservedRows.length ? [`reserved > 0 on ${reservedRows.map((r) => r.sku).join(", ")}`] : []),
    ...(unmappable.length ? [`unknown order status on ${unmappable.map((o) => `${o.reference}=${o.status}`).join(", ")}`] : []),
    ...(testMisfits.length ? [`owner-confirmed test order(s) no longer cancelled-without-refund: ${testMisfits.map((o) => `${o.reference}=${o.status}${o.refunded_at ? " (refunded)" : ""}`).join(", ")} — re-confirm with the owner`] : []),
    ...(bpc?.active ? [`${BPC_TEST_SKU} is ACTIVE — it must stay deactivated; resolve that first (this script won't change it)`] : []),
  ];
  if (blockers.length) { print(`\nSTOPPED: ${blockers.join("; ")}. Nothing executed.`); return { applied: false, blockers }; }
  if (!apply) { print("\nDry run: nothing executed. Re-run with --apply."); return { applied: false }; }

  const now = new Date().toISOString();
  await sql.transaction([
    sql.query(GUARD_CREATE),
    ...SCHEMA.map((q) => sql.query(q)),
    ...FUNCTIONS.map((q) => sql.query(q)),
    // Map existing orders BEFORE the status trigger exists; only the listed status changes are written to `status`.
    ...mapped.map((o) => sql.query(
      `UPDATE orders SET payment_status = $2, fulfillment_status = $3,
              payment_source = CASE WHEN paid_at IS NOT NULL AND NOT $4 THEN 'legacy' ELSE NULL END,
              payment_confirmed_at = CASE WHEN $4 THEN NULL ELSE paid_at END,
              payment_confirmed_by = CASE WHEN paid_at IS NOT NULL AND NOT $4 THEN 'legacy:pre-stage-3' ELSE NULL END
        WHERE id = $1`, [o.id, o.pay, o.ful, Boolean(o.unpaidTest)])),
    ...statusChanges.map((o) => sql.query("UPDATE orders SET status = $2 WHERE id = $1", [o.id, legacyStatus(o.pay, o.ful)])),
    ...unpaidTests.map((o) => sql.query(
      `INSERT INTO order_events (id, order_id, order_reference, event_type, actor, source, payment_status_before, payment_status_after,
              fulfillment_status_before, fulfillment_status_after, details, created_at)
       VALUES (gen_random_uuid()::text, $1, $2, 'legacy_classified_unpaid_test', 'system:migration', 'legacy', NULL, 'cancelled', NULL, 'cancelled',
               jsonb_build_object('note', $3::text, 'legacy_status', $4::text, 'legacy_paid_at', $5::text, 'decided_by', 'owner', 'decided_on', '2026-11-18'), $6)`,
      [o.id, o.reference, UNPAID_TEST_NOTE, o.status, o.paid_at ?? null, now])),
    ...TRIGGERS.map((q) => sql.query(q)),
    // A1 option 2. The lot starts empty and a 'lot_reconciliation' movement moves the units in (SKU total unchanged).
    sql.query(
      `INSERT INTO inventory_lots (id, lot_code, strength_id, sku, product_slug, kind, received_quantity, physical_quantity, received_at,
              testing_status, release_status, release_changed_at, release_changed_by, release_reason, notes, created_at, created_by, updated_at)
       SELECT gen_random_uuid()::text, 'RECON-' || s.sku, si.strength_id, s.sku, s.product_slug, 'reconciliation', si.physical_quantity, 0, si.created_at,
              'untested', 'quarantined', $1, 'system:migration',
              'Stage 3 migration: pre-Stage-3 recorded quantity with no lot record. Not sellable until reduced to what is physically held, split into real lots, or approved by an administrator.',
              NULL, $1, 'system:migration', $1
         FROM strength_inventory si JOIN product_strengths s ON s.id = si.strength_id WHERE si.physical_quantity > 0`, [now]),
    sql.query(
      `SELECT vc_inv_move(l.strength_id, l.id, 'lot_reconciliation', 0, 0, l.received_quantity, 0,
              'Stage 3 migration: existing recorded quantity placed in quarantined reconciliation lot (owner decision A1, option 2)', NULL,
              'system:migration', NULL, NULL, 'recon:' || l.strength_id)
         FROM inventory_lots l WHERE l.kind = 'reconciliation' ORDER BY l.strength_id`),
    sql.query(`INSERT INTO job_runs (id, job, source, started_at, finished_at, released_count) VALUES (gen_random_uuid()::text, 'stage3_migration', 'migration', $1, $1, 0)`, [now]),
    sql.query(GUARD_CHECK),
  ]);

  const after = await snapshot(sql);
  const problems = [];
  for (const k of Object.keys(PROTECTED)) if (before.fp[k] !== after.fp[k]) problems.push(`${k} changed`);
  const [rec] = await sql`
    SELECT (SELECT count(*)::int FROM inventory_lots WHERE kind = 'reconciliation') AS lots,
           (SELECT count(*)::int FROM inventory_lots WHERE release_status = 'approved') AS approved,
           (SELECT count(*)::int FROM strength_inventory si WHERE si.physical_quantity <> COALESCE((SELECT sum(physical_quantity) FROM inventory_lots l WHERE l.strength_id = si.strength_id), 0)) AS unreconciled,
           (SELECT count(*)::int FROM orders WHERE status <> vc_legacy_status(payment_status, fulfillment_status)) AS status_mismatch`;
  const [bpcAfter] = await sql.query("SELECT active FROM product_strengths WHERE upper(sku) = $1", [BPC_TEST_SKU]);
  if (rec.lots !== withStock.length) problems.push(`expected ${withStock.length} reconciliation lots, found ${rec.lots}`);
  if (rec.approved !== 0) problems.push(`${rec.approved} lot(s) approved — none should be`);
  if (rec.unreconciled !== 0) problems.push(`${rec.unreconciled} strength(s) not reconciled to their lots`);
  if (rec.status_mismatch !== 0) problems.push(`${rec.status_mismatch} order(s) whose status doesn't match payment/fulfillment`);
  if (bpc && bpcAfter?.active !== false) problems.push(`${BPC_TEST_SKU} is not deactivated after the migration`);
  if (unpaidTests.length) {
    const tests = await sql.query(
      `SELECT o.reference, o.payment_status, o.payment_confirmed_at, o.payment_source, o.status,
              (SELECT count(*)::int FROM order_events e WHERE e.order_id = o.id AND e.event_type = 'legacy_classified_unpaid_test') AS notes
         FROM orders o WHERE o.reference = ANY($1)`, [unpaidTests.map((o) => o.reference)]);
    for (const t of tests) {
      if (t.payment_status !== "cancelled" || t.payment_confirmed_at !== null || t.payment_source !== null || t.status !== "cancelled" || t.notes !== 1) {
        problems.push(`test order ${t.reference} not classified as unpaid (${t.payment_status}/${t.status}, notes ${t.notes})`);
      }
    }
  }
  const triggers = (await sql`SELECT tgname FROM pg_trigger WHERE NOT tgisinternal`).map((r) => r.tgname);
  for (const name of ["orders_derive_status", "strength_inventory_reconciled", "inventory_lots_reconciled", "inventory_allocations_reconciled",
    "order_events_append_only", "order_returns_append_only", "order_refunds_append_only", "inventory_movements_no_update_delete"]) {
    if (!triggers.includes(name)) problems.push(`trigger ${name} missing`);
  }
  print("\nAFTER fingerprints:", JSON.stringify(after.fp));
  print(problems.length ? `\nCHECK FAILED: ${problems.join("; ")}`
    : `\nChecks passed: ${rec.lots} quarantined reconciliation lot(s), 0 approved; every SKU reconciled to its lots; products, strengths, prices, SKUs, stock rows, existing movements, legacy inventory, certificates and subscriptions unchanged (also enforced inside the transaction); ${BPC_TEST_SKU} ${bpc ? "still deactivated" : "not present"}; ${statusChanges.length} listed order status change(s) only.`);
  return { applied: true, problems };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { config } = await import("dotenv");
  config({ path: ".env.local", quiet: true });
  const { neon } = await import("@neondatabase/serverless");
  if (!process.env.DATABASE_URL) { console.error("DATABASE_URL is not set in .env.local."); process.exit(1); }
  run(neon(process.env.DATABASE_URL), { apply: process.argv.includes("--apply"), refreshFunctions: process.argv.includes("--refresh-functions") }).catch((err) => {
    console.error("[stage3-orders] Failed:", err.message ?? err);
    process.exit(1);
  });
}
