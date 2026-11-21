// READ-ONLY verification after the Package 1 production apply (owner-authorized 2026-11-21). One transaction opened
// READ ONLY, so Postgres refuses any write. Run from the repo root: node scripts/refinements1-prod-verify-apply.mjs
import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";
config({ path: ".env.local", quiet: true });
const sql = neon(process.env.DATABASE_URL);
console.log("database host:", new URL(process.env.DATABASE_URL).hostname);

const [comps, names, flagged, content, bac, stock, trig] = await sql.transaction((tx) => [
  tx`SELECT c.blend_slug, c.declared_total_mg::float AS total, s.sku, s.label, c.created_by,
            string_agg(p.name || ' (' || b.component_slug || ') ' || b.amount_mg::float || 'mg', ' · ' ORDER BY b.position) AS ingredients
       FROM blend_compositions c JOIN product_strengths s ON s.id = c.blend_strength_id
       JOIN blend_components b USING (blend_strength_id) JOIN products p ON p.slug = b.component_slug
      GROUP BY 1, 2, 3, 4, 5 ORDER BY 1`,
  tx`SELECT slug, name, active, alternate_names FROM products WHERE slug IN ('tb-4', 'tb-500', 'cjc-1295-no-dac') ORDER BY slug`,
  tx`SELECT p.slug, p.active FROM products p WHERE (p.slug ILIKE '%blend%' OR p.name ILIKE '%blend%')
       AND NOT EXISTS (SELECT 1 FROM blend_compositions c WHERE c.blend_slug = p.slug) ORDER BY 1`,
  tx`SELECT key FROM site_content WHERE key IN ('policies', 'about_page')`,
  tx`SELECT p.slug, p.active, s.sku, s.price_usd::float AS price, s.active AS strength_active FROM products p JOIN product_strengths s ON s.product_slug = p.slug WHERE p.slug = 'bac-water'`,
  tx`SELECT sum(physical_quantity)::int AS units, (SELECT count(*)::int FROM inventory_movements) AS movements FROM strength_inventory`,
  tx`SELECT tgname FROM pg_trigger WHERE tgname IN ('blend_compositions_valid', 'blend_components_valid') ORDER BY 1`,
], { readOnly: true });

console.log("\ncompositions:");
for (const c of comps) console.log(`  ${c.blend_slug} · ${c.sku} · label "${c.label}" · total ${c.total} mg · ${c.ingredients} · by ${c.created_by}`);
console.log("\nproducts:");
for (const n of names) console.log(`  ${n.slug} · "${n.name}" · ${n.active ? "visible" : "hidden"} · alternate names ${n.alternate_names ?? "none"}`);
console.log(`\nblends without a composition: ${flagged.map((f) => `${f.slug} (${f.active ? "visible" : "hidden"})`).join(", ") || "none"}`);
console.log(`edited policies / About rows: ${content.map((r) => r.key).join(", ") || "none (code defaults apply)"}`);
console.log(`BAC Water (unchanged): ${JSON.stringify(bac)}`);
console.log(`stock: ${stock[0].units} units, ${stock[0].movements} movements`);
console.log(`check triggers present: ${trig.map((t) => t.tgname).join(", ")}`);
console.log("\nRead-only: nothing was written.");
