// Moves the CJC-1295 / Ipamorelin blend's stock onto the live product,
// October 2026. Its 9 units sat under the slug "ipamorelin-cjc-1295-blend",
// which has no product, while the real product "cjc-1295-ipamorelin-blend"
// showed 0.
//
//   node scripts/reconcile-blend-stock.mjs           # dry run: prints the plan
//   node scripts/reconcile-blend-stock.mjs --apply   # writes, in one transaction
//
// The stray row's quantity is added to the live row (creating it if missing,
// keeping its own threshold), then the stray row is deleted. Safe to re-run:
// once the stray row is gone there is nothing to do.
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });

import { randomUUID } from "crypto";
import { neon } from "@neondatabase/serverless";

const APPLY = process.argv.includes("--apply");
const ACTOR = "script:reconcile-blend-stock";
const FROM = "ipamorelin-cjc-1295-blend";
const TO = "cjc-1295-ipamorelin-blend";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not set in .env.local.");
  process.exit(1);
}
const sql = neon(connectionString);

async function main() {
  const [product] = await sql`SELECT slug, name FROM products WHERE slug = ${TO}`;
  if (!product) throw new Error(`No product "${TO}" — nothing to attach the stock to.`);
  const [straySlugProduct] = await sql`SELECT slug FROM products WHERE slug = ${FROM}`;
  if (straySlugProduct) throw new Error(`"${FROM}" is a real product; not moving its stock.`);

  const [from] = await sql`SELECT quantity, threshold FROM inventory WHERE slug = ${FROM}`;
  if (!from) {
    console.log(`No inventory row under "${FROM}". Nothing to do.`);
    return;
  }
  const [to] = await sql`SELECT quantity, threshold FROM inventory WHERE slug = ${TO}`;
  const quantity = (to?.quantity ?? 0) + from.quantity;
  const now = new Date().toISOString();

  console.log(`${FROM}: ${from.quantity} units → ${TO} (${to ? `${to.quantity} now` : "no row yet"}), giving ${quantity}.`);
  console.log(`Delete inventory row "${FROM}".`);

  const statements = [
    to
      ? sql`UPDATE inventory SET quantity = ${quantity} WHERE slug = ${TO}`
      : sql`INSERT INTO inventory (slug, quantity, threshold) VALUES (${TO}, ${quantity}, ${from.threshold})`,
    sql`DELETE FROM inventory WHERE slug = ${FROM}`,
    sql`INSERT INTO activity_log (id, actor_email, action, details, created_at) VALUES (${randomUUID()}, ${ACTOR}, ${"inventory.reconciled"}, ${`${from.quantity} units moved from stray slug ${FROM} to ${product.name} (${TO}); now ${quantity}`}, ${now})`,
  ];

  if (!APPLY) {
    console.log(`\nDry run: ${statements.length} statements not executed. Re-run with --apply.`);
    return;
  }
  await sql.transaction(statements);
  console.log(`\nApplied ${statements.length} statements in one transaction.`);
}

main().catch((err) => {
  console.error("[reconcile-blend-stock] Failed:", err);
  process.exit(1);
});
