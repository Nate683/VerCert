// READ-ONLY verification after the Stage 3 production apply (owner-authorized 2026-11-19). Every query runs in ONE
// transaction opened READ ONLY, so Postgres refuses any write. Run from the repo root: node scripts/stage3-prod-verify-apply.mjs
import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";
config({ path: ".env.local", quiet: true });
const sql = neon(process.env.DATABASE_URL);
console.log("database host:", new URL(process.env.DATABASE_URL).hostname);

const [orders, notes, lots, recon, sellable, trig, runs, bpc] = await sql.transaction((tx) => [
  tx`SELECT reference, status, payment_status, fulfillment_status, payment_source, payment_confirmed_at, paid_at, cancelled_at, refunded_at, refund_amount, total
       FROM orders ORDER BY created_at`,
  tx`SELECT order_reference, event_type, source, payment_status_after, details->>'legacy_paid_at' AS legacy_paid_at FROM order_events ORDER BY order_reference`,
  tx`SELECT count(*)::int AS n, count(*) FILTER (WHERE release_status = 'quarantined')::int AS quarantined,
            count(*) FILTER (WHERE release_status = 'approved')::int AS approved, COALESCE(sum(physical_quantity), 0)::int AS units FROM inventory_lots`,
  tx`SELECT count(*)::int AS unreconciled FROM strength_inventory si
      WHERE si.physical_quantity <> COALESCE((SELECT sum(physical_quantity) FROM inventory_lots l WHERE l.strength_id = si.strength_id), 0)`,
  tx`SELECT COALESCE(sum(sellable), 0)::int AS sellable FROM vc_sellable()`,
  tx`SELECT tgname FROM pg_trigger WHERE NOT tgisinternal AND tgname IN ('orders_derive_status', 'strength_inventory_reconciled', 'inventory_lots_reconciled',
       'inventory_allocations_reconciled', 'order_events_append_only', 'order_returns_append_only', 'order_refunds_append_only', 'inventory_movements_no_update_delete') ORDER BY 1`,
  tx`SELECT job, source, started_at FROM job_runs ORDER BY started_at`,
  tx`SELECT active FROM product_strengths WHERE upper(sku) = 'BPC-157-20MG'`,
], { readOnly: true });

console.log("\norders:");
for (const o of orders) console.log(`  ${o.reference} · status ${o.status} · payment ${o.payment_status} / fulfillment ${o.fulfillment_status} · source ${o.payment_source ?? "—"} · confirmed_at ${o.payment_confirmed_at ?? "—"} · paid_at ${o.paid_at ?? "—"} · refund ${o.refund_amount ?? "—"}/${o.total}`);
console.log("\norder_events:");
for (const e of notes) console.log(`  ${e.order_reference} · ${e.event_type} · ${e.source} · payment → ${e.payment_status_after} · legacy_paid_at ${e.legacy_paid_at ?? "—"}`);
console.log(`\nlots: ${lots[0].n} (quarantined ${lots[0].quarantined}, approved ${lots[0].approved}), units ${lots[0].units}`);
console.log(`strengths not reconciled to their lots: ${recon[0].unreconciled}`);
console.log(`total sellable units (vc_sellable): ${sellable[0].sellable}`);
console.log(`Stage 3 triggers present: ${trig.length}/8 (${trig.map((t) => t.tgname).join(", ")})`);
console.log(`job_runs: ${runs.map((r) => `${r.job}/${r.source} @ ${r.started_at}`).join("; ")}`);
console.log(`BPC-157-20MG active: ${bpc[0]?.active ?? "absent"}`);
console.log("\nRead-only: nothing was written.");
