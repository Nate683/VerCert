// LOCAL ONLY. Stage 3 migration safety tests, from the pre-migration snapshot (snap_pre3):
//  - the dry run writes nothing and prints a content manifest
//  - an ACTIVE BPC-157 20mg stops it; deactivated, it is left untouched
//  - the in-transaction guard: a planted trigger that edits a product description mid-migration makes the WHOLE
//    migration roll back (nothing applied)
//  - a clean apply preserves every product / strength / price / SKU / certificate / stock row / movement / subscription,
//    maps orders as listed (incl. Stage 2 partial refunds), and leaves every reconciliation lot quarantined
// Ends by saving snap_post3 for the other suites.
import { execFileSync } from "child_process";
import path from "path";
import pg from "pg";
const here = path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Z]:)/, "$1");
const local = (args) => {
  try { return { ok: true, out: execFileSync("bash", [path.join(here, "local.sh"), "node", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }) }; }
  catch (e) { return { ok: false, out: `${e.stdout ?? ""}${e.stderr ?? ""}` }; }
};
const snap = (m, n) => execFileSync("node", [path.join(here, "db-snapshot.mjs"), m, n], { encoding: "utf8" });
let pass = 0, fail = 0; const failures = [];
const check = (name, ok, detail = "") => { if (ok) pass++; else { fail++; failures.push(name); } console.log(`${ok ? "PASS" : "FAIL"}  [MIG] ${name}${detail ? `  — ${detail}` : ""}`); };
const withDb = async (fn) => { const c = new pg.Client({ host: "127.0.0.1", port: 5491, user: "demo", password: "demo", database: "demo" }); await c.connect(); try { return await fn(c); } finally { await c.end(); } };
const fp = () => withDb(async (c) => (await c.query(`SELECT
  (SELECT md5(string_agg(to_jsonb(p)::text, '|' ORDER BY slug)) FROM products p) AS products,
  (SELECT md5(string_agg(to_jsonb(s)::text, '|' ORDER BY id)) FROM product_strengths s) AS strengths,
  (SELECT md5(string_agg(to_jsonb(si)::text, '|' ORDER BY strength_id)) FROM strength_inventory si) AS stock,
  (SELECT md5(coalesce(string_agg(to_jsonb(r)::text, '|' ORDER BY id), '')) FROM coa_records r) AS coa,
  (SELECT count(*) FROM inventory_movements) AS movements,
  (SELECT to_regclass('public.inventory_lots') IS NOT NULL) AS stage3`)).rows[0]);

snap("restore", "pre3");
const f0 = await fp();
const dry = local(["scripts/stage3-orders.mjs"]);
const f1 = await fp();
check("dry run writes nothing", JSON.stringify(f0) === JSON.stringify(f1) && dry.ok);
check("dry run prints a content manifest (products, strengths with SKU/price/status, content fingerprints)", /CONTENT MANIFEST/.test(dry.out) && /content#/.test(dry.out) && /SKU · id · label · price/.test(dry.out));
check("dry run lists the Stage 2 partial refunds and status changes", /partially refunded.*VC-LEG007 20\/50/.test(dry.out) && /VC-LEG005 paid→cancelled/.test(dry.out));
check("dry run reports BPC-157-20MG deactivated and untouched", /BPC-157-20MG: deactivated \(left untouched\)/.test(dry.out));
// --- round 4: historical order mapping in the dry run ---
check("dry run maps the owner-confirmed test orders to payment cancelled (not confirmed)",
  /VC-E3SQJ9 · cancelled → cancelled \/ cancelled/.test(dry.out) && /VC-38UTPQ · cancelled → cancelled \/ cancelled/.test(dry.out)
  && /owner-confirmed unpaid test orders .*VC-E3SQJ9 \(Stage 2 paid_at kept\), VC-38UTPQ/.test(dry.out));
check("dry run: the same shape NOT on the owner's list keeps the generic rule (VC-LEG009 → confirmed / cancelled)", /VC-LEG009 · cancelled → confirmed \/ cancelled/.test(dry.out));
check("dry run: shipped + fully refunded → refunded / shipped, no status change (VC-LEG010)", /VC-LEG010 · shipped \(refunded 50 of 50\) → refunded \/ shipped\r?$/m.test(dry.out));
// A listed test order that is no longer cancelled-without-refund must stop the migration, not be reclassified.
for (const [label, tweak, undo] of [
  ["refunded", "UPDATE orders SET refunded_at = created_at, refund_amount = total WHERE reference = 'VC-E3SQJ9'", "UPDATE orders SET refunded_at = NULL, refund_amount = NULL WHERE reference = 'VC-E3SQJ9'"],
  ["no longer cancelled", "UPDATE orders SET status = 'paid' WHERE reference = 'VC-38UTPQ'", "UPDATE orders SET status = 'cancelled' WHERE reference = 'VC-38UTPQ'"],
]) {
  await withDb((c) => c.query(tweak));
  const st = local(["scripts/stage3-orders.mjs", "--apply"]);
  await withDb((c) => c.query(undo));
  check(`a listed test order that is ${label} STOPS the migration (nothing executed)`, /STOPPED: .*owner-confirmed test order/.test(st.out) && !(await fp()).stage3);
}

await withDb((c) => c.query("UPDATE product_strengths SET active = TRUE WHERE sku = 'BPC-157-20MG'"));
const stop = local(["scripts/stage3-orders.mjs", "--apply"]);
check("an ACTIVE BPC-157 20mg stops the migration (nothing executed)", /STOPPED: BPC-157-20MG is ACTIVE/.test(stop.out) && !(await fp()).stage3);
await withDb((c) => c.query("UPDATE product_strengths SET active = FALSE WHERE sku = 'BPC-157-20MG'"));

// Plant a trigger that edits a product while the migration maps orders.
await withDb(async (c) => {
  await c.query(`CREATE FUNCTION test_tamper() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN UPDATE products SET description = description || ' ' WHERE slug = 'kpv'; RETURN NEW; END $$`);
  await c.query("CREATE TRIGGER test_tamper AFTER UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION test_tamper()");
});
const f2 = await fp();
const tampered = local(["scripts/stage3-orders.mjs", "--apply"]);
const f3 = await fp();
check("guard: a product changed mid-migration → the migration fails", !tampered.ok && /stage3 guard: protected data changed \(products\)/.test(tampered.out), tampered.out.split("\n").filter((l) => /guard|Failed/.test(l)).join(" "));
check("guard: nothing was applied (no Stage 3 objects, products/stock/movements unchanged)", !f3.stage3 && f3.products === f2.products && f3.stock === f2.stock && f3.movements === f2.movements);
await withDb(async (c) => { await c.query("DROP TRIGGER test_tamper ON orders"); await c.query("DROP FUNCTION test_tamper()"); });

const ORDER_COLS = "id, reference, created_at, status, payment_method, customer_id, customer, items, subtotal, total, paid_at, processing_at, shipped_at, delivered_at, cancelled_at, cancel_reason, carrier, tracking_number, stock_decremented, promo_code, promo_code_id, discount_amount, free_shipping, refunded_at, refund_reason, refund_amount";
const ordersBefore = await withDb(async (c) => (await c.query(`SELECT ${ORDER_COLS} FROM orders ORDER BY id`)).rows);
const before = await fp();
const ok = local(["scripts/stage3-orders.mjs", "--apply"]);
const after = await fp();
check("clean apply: checks pass", ok.ok && /Checks passed/.test(ok.out), ok.out.split("\n").slice(-2).join(" "));
check("clean apply: products, strengths (prices, SKUs, status, active), stock rows and certificates byte-identical",
  before.products === after.products && before.strengths === after.strengths && before.stock === after.stock && before.coa === after.coa);
const rows = await withDb(async (c) => ({
  bpc: (await c.query("SELECT active FROM product_strengths WHERE sku = 'BPC-157-20MG'")).rows[0],
  recon: (await c.query("SELECT count(*)::int n, count(*) FILTER (WHERE release_status = 'quarantined')::int q FROM inventory_lots WHERE kind = 'reconciliation'")).rows[0],
  leg7: (await c.query("SELECT payment_status, fulfillment_status, status, refund_amount FROM orders WHERE reference = 'VC-LEG007'")).rows[0],
  leg8: (await c.query("SELECT payment_status, fulfillment_status, status FROM orders WHERE reference = 'VC-LEG008'")).rows[0],
  leg5: (await c.query("SELECT payment_status, status FROM orders WHERE reference = 'VC-LEG005'")).rows[0],
  bpcLot: (await c.query("SELECT count(*)::int n FROM inventory_lots WHERE sku = 'BPC-157-20MG'")).rows[0],
}));
check("BPC-157 20mg still deactivated after the migration, no lot created for it (0 units)", rows.bpc.active === false && rows.bpcLot.n === 0);
check("every reconciliation lot is quarantined", rows.recon.n > 0 && rows.recon.n === rows.recon.q, JSON.stringify(rows.recon));
check("Stage 2 partial refund (unshipped) → partially_refunded / cancelled", rows.leg7.payment_status === "partially_refunded" && rows.leg7.fulfillment_status === "cancelled");
check("Stage 2 partial refund (shipped) → partially_refunded / shipped, status still shipped", rows.leg8.payment_status === "partially_refunded" && rows.leg8.status === "shipped");
check("Stage 2 full refund → refunded", rows.leg5.payment_status === "refunded");
// --- round 4: historical order mapping after the apply ---
const r4 = await withDb(async (c) => {
  const by = async (ref) => (await c.query(`SELECT reference, status, payment_status, fulfillment_status, payment_source, payment_confirmed_at, payment_confirmed_by, paid_at, cancelled_at,
      (SELECT count(*)::int FROM order_events e WHERE e.order_id = o.id AND e.event_type = 'legacy_classified_unpaid_test') AS notes,
      (SELECT details FROM order_events e WHERE e.order_id = o.id AND e.event_type = 'legacy_classified_unpaid_test' LIMIT 1) AS note
      FROM orders o WHERE reference = $1`, [ref])).rows[0];
  return { e3: await by("VC-E3SQJ9"), u38: await by("VC-38UTPQ"), l9: await by("VC-LEG009"), l10: await by("VC-LEG010"), l2: await by("VC-LEG002"),
    l3: await by("VC-LEG003"), l4: await by("VC-LEG004"), after: (await c.query(`SELECT ${ORDER_COLS} FROM orders ORDER BY id`)).rows,
    otherNotes: (await c.query("SELECT count(*)::int AS n FROM order_events WHERE event_type = 'legacy_classified_unpaid_test' AND order_reference NOT IN ('VC-E3SQJ9', 'VC-38UTPQ')")).rows[0].n };
});
const pre = (ref) => ordersBefore.find((o) => o.reference === ref);
for (const t of [r4.e3, r4.u38]) {
  check(`${t.reference}: payment cancelled / fulfillment cancelled / status cancelled — not paid`, t.payment_status === "cancelled" && t.fulfillment_status === "cancelled" && t.status === "cancelled", JSON.stringify([t.payment_status, t.fulfillment_status, t.status]));
  check(`${t.reference}: no payment confirmation recorded (source, confirmed at/by all empty)`, t.payment_source === null && t.payment_confirmed_at === null && t.payment_confirmed_by === null);
  check(`${t.reference}: original paid_at and cancelled_at kept exactly`, t.paid_at !== null && t.paid_at === pre(t.reference).paid_at && t.cancelled_at === pre(t.reference).cancelled_at);
  check(`${t.reference}: one audit note recording the owner's classification`, t.notes === 1 && /no payment was received/.test(t.note?.note ?? "") && t.note?.legacy_paid_at === t.paid_at);
}
check("no other order received the test-order note", r4.otherNotes === 0);
check("control VC-LEG009 (same shape, not listed): confirmed / cancelled with legacy confirmation — generic rule unchanged",
  r4.l9.payment_status === "confirmed" && r4.l9.fulfillment_status === "cancelled" && r4.l9.payment_source === "legacy" && r4.l9.payment_confirmed_at === r4.l9.paid_at && r4.l9.notes === 0);
check("legitimate paid order (VC-LEG002) → confirmed / allocated, legacy confirmation, status paid", r4.l2.payment_status === "confirmed" && r4.l2.fulfillment_status === "allocated" && r4.l2.payment_source === "legacy" && r4.l2.status === "paid");
check("legitimate shipped order (VC-LEG003) → confirmed / shipped, status shipped", r4.l3.payment_status === "confirmed" && r4.l3.fulfillment_status === "shipped" && r4.l3.status === "shipped");
check("shipped + fully refunded (VC-LEG010) → refunded / shipped, status shipped", r4.l10.payment_status === "refunded" && r4.l10.fulfillment_status === "shipped" && r4.l10.status === "shipped");
check("cancelled, never paid (VC-LEG004) → cancelled / cancelled, no confirmation", r4.l4.payment_status === "cancelled" && r4.l4.fulfillment_status === "cancelled" && r4.l4.payment_source === null);
const changed = ordersBefore.filter((o) => JSON.stringify(o) !== JSON.stringify(r4.after.find((a) => a.id === o.id)));
// The only differences allowed: the `status` of the two LISTED status changes (refunded before shipment → cancelled).
const onlyStatus = changed.every((o) => { const a = r4.after.find((x) => x.id === o.id); return JSON.stringify({ ...o, status: null }) === JSON.stringify({ ...a, status: null }) && a.status === "cancelled"; });
check("every order's Stage 2 columns (timestamps, amounts, refund fields, items) unchanged; only the 2 listed status changes (VC-LEG005, VC-LEG007), status column only",
  changed.map((o) => o.reference).sort().join(",") === "VC-LEG005,VC-LEG007" && onlyStatus && r4.after.length === ordersBefore.length, changed.map((o) => o.reference).join(","));
const again = local(["scripts/stage3-orders.mjs", "--apply"]);
check("re-running the migration does nothing", /already exist/.test(again.out));
snap("save", "post3");
console.log(`\n[MIG] ${pass} passed, ${fail} failed (${pass + fail} checks)${failures.length ? `\nFAILED: ${failures.join(" | ")}` : ""}`);
process.exit(fail ? 1 : 0);
