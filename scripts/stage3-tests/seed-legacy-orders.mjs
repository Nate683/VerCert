// LOCAL TEST DB ONLY. Creates pre-Stage-3 orders the way Stage 2 code left them (status column only, stock deducted
// per SKU with Stage 2's movement keys), so the Stage 3 migration's order mapping and legacy restores can be tested.
import { randomUUID } from "crypto";
import { neon } from "@neondatabase/serverless";
if (!process.env.DATABASE_URL?.includes(".invalid")) throw new Error("not the local test DB — refusing");
const sql = neon(process.env.DATABASE_URL);

const [s] = await sql`SELECT s.id, s.sku, s.product_slug, s.label, p.name FROM product_strengths s JOIN products p ON p.slug = s.product_slug
                        JOIN strength_inventory si ON si.strength_id = s.id WHERE si.physical_quantity >= 20 ORDER BY s.sku LIMIT 1`;
const customer = { firstName: "Leg", lastName: "Acy", email: "buyer1@example.invalid", address: "1 Test St", city: "Austin", state: "TX", postalCode: "73301", country: "US" };
const line = (q) => [{ slug: s.product_slug, name: s.name, sizeLabel: s.label, strengthId: s.id, sku: s.sku, priceUsd: 50, quantity: q }];
const now = new Date().toISOString();
const specs = [
  ["VC-LEG001", "awaiting_payment", {}],
  ["VC-LEG002", "paid", { paid: true, deduct: 2 }],
  ["VC-LEG003", "shipped", { paid: true, deduct: 1, shipped: true }],
  ["VC-LEG004", "cancelled", {}],
  ["VC-LEG005", "paid", { paid: true, refunded: true }],   // Stage 2 refund: stock deducted then restored, status stays paid
  ["VC-LEG006", "expired", {}],
  // Stage 2 partial refunds (refund_amount < total): mapped to partially_refunded by the Stage 3 migration.
  ["VC-LEG007", "paid", { paid: true, refunded: true, refundAmount: 20 }],
  ["VC-LEG008", "shipped", { paid: true, deduct: 1, shipped: true, refunded: true, refundAmount: 15 }],
  // Round 4 (production shapes). Paid then cancelled under Stage 2: cancelOrder restored the stock and kept paid_at.
  ["VC-E3SQJ9", "cancelled", { paid: true, deduct: 1, restore: true, cancelled: true }],
  ["VC-38UTPQ", "cancelled", { paid: true, cancelled: true }],
  ["VC-LEG009", "cancelled", { paid: true, deduct: 1, restore: true, cancelled: true }],   // same shape, NOT owner-listed
  ["VC-LEG010", "shipped", { paid: true, deduct: 1, shipped: true, refunded: true }],      // shipped, fully refunded
];
// Only these are added when re-run on a database that already has the first six.
const only = process.argv.includes("--partials-only") ? new Set(["VC-LEG007", "VC-LEG008"])
  : process.argv.includes("--round4-only") ? new Set(["VC-E3SQJ9", "VC-38UTPQ", "VC-LEG009", "VC-LEG010"]) : null;
for (const [ref, status, o] of specs) {
  if (only && !only.has(ref)) continue;
  const id = randomUUID();
  const q = o.deduct ?? 1;
  await sql.query(
    `INSERT INTO orders (id, reference, created_at, status, payment_method, customer_id, customer, items, subtotal, total, paid_at, shipped_at,
                         carrier, tracking_number, stock_decremented, refunded_at, refund_reason, refund_amount, cancelled_at, cancel_reason)
     VALUES ($1, $2, $3, $4, 'bank_transfer', 'demo-customer', $5, $6, $7, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
    [id, ref, now, status, JSON.stringify(customer), JSON.stringify(line(q)), 50 * q, o.paid ? now : null, o.shipped ? now : null,
      o.shipped ? "USPS" : null, o.shipped ? "9400TEST" : null, Boolean(o.deduct) && !o.restore, o.refunded ? now : null, o.refunded ? "customer_request" : null, o.refunded ? (o.refundAmount ?? 50 * q) : null,
      o.cancelled ? now : null, o.cancelled ? "test order" : null]
  );
  if (o.deduct) {
    // Exactly what Stage 2's decrementStock recorded.
    await sql.query(
      `WITH cur AS (SELECT strength_id, physical_quantity AS old FROM strength_inventory WHERE strength_id = $1 FOR UPDATE),
            upd AS (UPDATE strength_inventory si SET physical_quantity = si.physical_quantity - $2, version = si.version + 1, updated_at = $3
                      FROM cur WHERE si.strength_id = cur.strength_id RETURNING si.strength_id, cur.old, si.physical_quantity AS new)
       INSERT INTO inventory_movements (id, strength_id, sku, product_slug, strength_label, movement_type, quantity_change, previous_quantity,
                                        resulting_quantity, reason, note, actor, reference, idempotency_key, created_at)
       SELECT $4, upd.strength_id, $5, $6, $7, 'order_deducted', upd.new - upd.old, upd.old, upd.new, $8, NULL, 'system:order', $9, $10, $3 FROM upd`,
      [s.id, q, now, randomUUID(), s.sku, s.product_slug, s.label, `Order ${ref} paid`, ref, `order:${ref}:0:deducted`]
    );
  }
  if (o.restore) {
    // What Stage 2's cancelOrder → restoreStock recorded.
    await sql.query(
      `WITH cur AS (SELECT strength_id, physical_quantity AS old FROM strength_inventory WHERE strength_id = $1 FOR UPDATE),
            upd AS (UPDATE strength_inventory si SET physical_quantity = si.physical_quantity + $2, version = si.version + 1, updated_at = $3
                      FROM cur WHERE si.strength_id = cur.strength_id RETURNING si.strength_id, cur.old, si.physical_quantity AS new)
       INSERT INTO inventory_movements (id, strength_id, sku, product_slug, strength_label, movement_type, quantity_change, previous_quantity,
                                        resulting_quantity, reason, note, actor, reference, idempotency_key, created_at)
       SELECT $4, upd.strength_id, $5, $6, $7, 'order_restored', upd.new - upd.old, upd.old, upd.new, $8, NULL, 'system:order', $9, $10, $3 FROM upd`,
      [s.id, q, now, randomUUID(), s.sku, s.product_slug, s.label, `Order ${ref} cancelled`, ref, `order:${ref}:0:restored`]
    );
  }
}
console.log(`seeded ${specs.length} pre-Stage-3 orders on ${s.sku}`);
