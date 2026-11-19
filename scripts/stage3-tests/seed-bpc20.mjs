// LOCAL TEST DB ONLY. Adds a DEACTIVATED BPC-157 20mg strength (opened at 0 units, as production's Stage 2 did) so
// the Stage 3 migration's "BPC-157 20mg stays deactivated" assertion can be tested. `--activate` flips it active
// (to test that the dry run STOPS); `--deactivate` flips it back.
import { randomUUID } from "crypto";
import { neon } from "@neondatabase/serverless";
if (!process.env.DATABASE_URL?.includes(".invalid")) throw new Error("not the local test DB — refusing");
const sql = neon(process.env.DATABASE_URL);
const mode = process.argv[2];
if (mode === "--activate" || mode === "--deactivate") {
  await sql.query("UPDATE product_strengths SET active = $1 WHERE sku = 'BPC-157-20MG'", [mode === "--activate"]);
  console.log(`BPC-157-20MG active = ${mode === "--activate"}`);
} else {
  const id = randomUUID();
  const now = new Date().toISOString();
  await sql.transaction([
    sql.query(`INSERT INTO product_strengths (id, product_slug, label, sku, position, active, availability_status, price_usd, created_at, updated_at)
               VALUES ($1, 'bpc-157', '20mg', 'BPC-157-20MG', 9, FALSE, 'in_stock', 99, $2, $2)`, [id, now]),
    sql.query("INSERT INTO strength_inventory (strength_id, physical_quantity, reserved_quantity, low_stock_threshold, version, created_at, updated_at) VALUES ($1, 0, 0, 10, 0, $2, $2)", [id, now]),
    sql.query(`INSERT INTO inventory_movements (id, strength_id, sku, product_slug, strength_label, movement_type, quantity_change, previous_quantity, resulting_quantity,
                 reason, note, actor, reference, idempotency_key, created_at) VALUES ($1, $2, 'BPC-157-20MG', 'bpc-157', '20mg', 'opening_balance', 0, 0, 0,
                 'Stage 2 migration: opening balance', 'test-only strength, opened at 0 by owner decision', 'system:migration', NULL, $3, $4)`,
      [randomUUID(), id, `opening:${id}`, now]),
  ]);
  console.log("added deactivated BPC-157-20MG at 0 units");
}
