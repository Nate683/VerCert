// LOCAL TEST DB ONLY. Loads an old (2026-11-07) catalog snapshot into the empty local database, then the caller runs
// the repo's own Stage 1 / Stage 2 migration scripts so the local schema matches production's shape.
// Also creates test accounts: demo-command (role command), demo-office (role office), demo-customer, demo-customer2.
// Usage (env.sh sourced): node seed-local.mjs
import fs from "fs";
import { neon } from "@neondatabase/serverless";
if (!process.env.DATABASE_URL?.includes(".invalid")) throw new Error("not the local test DB — refusing");
const sql = neon(process.env.DATABASE_URL);
const snap = JSON.parse(fs.readFileSync(process.env.CATALOG_SNAPSHOT ?? new URL("../../../e017b540-0ab9-444b-9557-ebd056174d16/scratchpad/prod-catalog.json", import.meta.url), "utf8"));

const cols = (await sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'products'`).map((r) => r.column_name);
for (const p of snap.products) {
  const keys = Object.keys(p).filter((k) => cols.includes(k));
  await sql.query(
    `INSERT INTO products (${keys.join(", ")}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(", ")}) ON CONFLICT (slug) DO NOTHING`,
    keys.map((k) => p[k])
  );
}
// Every snapshot product is purchasable-status in the test DB so ordering paths can be exercised.
await sql`UPDATE products SET availability_status = 'in_stock' WHERE active`;
for (const i of snap.inventory) {
  await sql`INSERT INTO inventory (slug, size_label, quantity, threshold) VALUES (${i.slug}, ${i.size_label}, ${i.quantity}, ${i.threshold}) ON CONFLICT DO NOTHING`;
}
const now = new Date().toISOString();
for (const [id, email, role, first] of [
  ["demo-command", "command@example.invalid", "command", "Cora"],
  ["demo-office", "office@example.invalid", "office", "Otto"],
  ["demo-customer", "buyer1@example.invalid", null, "Bea"],
  ["demo-customer2", "buyer2@example.invalid", null, "Cal"],
]) {
  await sql.query(
    `INSERT INTO users (id, email, password_hash, created_at, role, first_name, last_name, research_category, registration_ack_at,
                        registration_ack_text, age_attested_at, research_prompt_resolved_at, email_verified)
     VALUES ($1, $2, 'x', $3, $4, $5, 'Test', 'Academic research', $3, 'ack', $3, $3, TRUE) ON CONFLICT (id) DO NOTHING`,
    [id, email, now, role, first]
  );
}
await sql`INSERT INTO site_content (key, value, updated_at) VALUES ('ordering', '{"enabled":true}', ${now})
          ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`;
console.log(`seeded ${snap.products.length} products, ${snap.inventory.length} legacy inventory rows, 4 users, ordering ON (local only)`);
