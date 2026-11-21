// READ-ONLY. NOT YET AUTHORIZED — run only if the owner approves (Website Refinements Package 1, governance A2/A3).
// Every query runs in ONE transaction opened READ ONLY, so Postgres refuses any write. Prints values exactly as stored.
//   1. TB-4 and TB-500: name, visibility, CAS, molecular formula, molecular weight, sequence/form, alternate names.
//   2. Every blend: product name, visibility, and each strength's label, price, active flag and stored composition.
// Run from the repo root: node scripts/refinements1-prod-readonly.mjs
import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";
config({ path: ".env.local", quiet: true });
const sql = neon(process.env.DATABASE_URL);
console.log("database host:", new URL(process.env.DATABASE_URL).hostname);

const [tb, blends] = await sql.transaction((tx) => [
  tx`SELECT slug, name, active, cas_number, molecular_formula, molecular_weight, sequence_or_form, alternate_names, updated_at
       FROM products WHERE slug IN ('tb-4', 'tb-500') ORDER BY slug`,
  tx`SELECT p.slug, p.name, p.active, s.id AS strength_id, s.sku, s.label, s.price_usd, s.active AS strength_active, s.composition
       FROM products p JOIN product_strengths s ON s.product_slug = p.slug
      WHERE p.slug ILIKE '%blend%' OR p.name ILIKE '%blend%' OR (s.composition IS NOT NULL AND jsonb_array_length(s.composition) > 0)
      ORDER BY p.slug, s.position`,
], { readOnly: true });

console.log("\n=== 1. TB-4 / TB-500 (exactly as stored) ===");
for (const r of tb) console.log(JSON.stringify(r, null, 1));
console.log("\n=== 2. Blends and stored compositions ===");
for (const r of blends) {
  console.log(`${r.slug} · "${r.name}" · ${r.active ? "visible" : "hidden"} · ${r.sku} · label ${JSON.stringify(r.label)} · price ${r.price_usd ?? "unpriced"} · strength ${r.strength_active ? "active" : "DEACTIVATED"}`);
  console.log(`    composition: ${JSON.stringify(r.composition)}`);
}
console.log("\nRead-only: nothing was written.");
