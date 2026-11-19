// LOCAL TEST DB ONLY. migrate.mjs creates the Stage 1/2 tables empty on a fresh database; drop them (only if empty)
// so the real Stage 1/2 migration scripts can create and fill them as they did in production.
import { neon } from "@neondatabase/serverless";
if (!process.env.DATABASE_URL?.includes(".invalid")) throw new Error("not the local test DB — refusing");
const sql = neon(process.env.DATABASE_URL);
const only = process.argv[2] ? process.argv[2].split(",") : ["inventory_movements", "strength_inventory", "product_strengths"];
if (process.argv.includes("--fn")) await sql.query("DROP FUNCTION IF EXISTS inventory_movements_append_only() CASCADE");
if (process.argv.includes("--idx")) {
  await sql.query("DROP INDEX IF EXISTS product_strengths_product_label_norm");
  await sql.query("DROP INDEX IF EXISTS product_strengths_sku_ci");
}
for (const t of only) {
  if (t.startsWith("--")) continue;
  if (!(await sql.query(`SELECT to_regclass($1::text) AS r`, [t]))[0].r) continue;
  const [{ n }] = await sql.query(`SELECT count(*)::int AS n FROM ${t}`);
  if (n !== 0) throw new Error(`${t} has ${n} rows — not dropping`);
  await sql.query(`DROP TABLE ${t}`);
  console.log(`dropped empty ${t}`);
}
