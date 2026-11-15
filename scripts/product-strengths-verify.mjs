// READ-ONLY: compares every product_strengths row with the size it came from in products.sizes, field by field,
// with JSON compared by value (JSONB stores object keys in its own order, so text comparison is not meaningful).
//   node scripts/product-strengths-verify.mjs
import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";
config({ path: ".env.local", quiet: true });
const sql = neon(process.env.DATABASE_URL);

const canon = (v) => (Array.isArray(v) ? v.map(canon) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v);
const same = (a, b) => JSON.stringify(canon(a ?? null)) === JSON.stringify(canon(b ?? null));
const dateText = (d) => (d == null ? null : typeof d === "string" ? d.slice(0, 10) : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
const skuOf = (slug, label) => `${slug}-${label}`.toUpperCase().replace(/\s+/g, "");

const products = await sql`SELECT slug, sizes, availability_status, estimated_available_on FROM products`;
const strengths = await sql`SELECT * FROM product_strengths`;
const problems = [];
let expected = 0;
for (const p of products) {
  const sizes = JSON.parse(p.sizes);
  sizes.forEach((s, i) => {
    expected++;
    const r = strengths.find((x) => x.product_slug === p.slug && x.label === s.label);
    if (!r) return problems.push(`${p.slug} ${s.label}: missing`);
    const diffs = [];
    if (r.sku !== skuOf(p.slug, s.label)) diffs.push("sku");
    if (r.position !== i) diffs.push("position");
    if (r.active !== true) diffs.push("active");
    if (r.image_url !== null) diffs.push("image_url");
    if (r.availability_status !== p.availability_status) diffs.push("status");
    if (dateText(r.estimated_available_on) !== dateText(p.estimated_available_on)) diffs.push("date");
    if (r.price_usd !== (typeof s.priceUsd === "number" ? s.priceUsd : null)) diffs.push("price");
    if (r.cost_usd !== (typeof s.costUsd === "number" ? s.costUsd : null)) diffs.push("cost");
    if (!same(r.bulk_tiers, s.bulkTiers?.length ? s.bulkTiers : null)) diffs.push(`bulk_tiers ${JSON.stringify(r.bulk_tiers)} vs ${JSON.stringify(s.bulkTiers)}`);
    if (!same(r.composition, s.composition?.length ? s.composition : null)) diffs.push(`composition ${JSON.stringify(r.composition)} vs ${JSON.stringify(s.composition)}`);
    if (diffs.length) problems.push(`${p.slug} ${s.label}: ${diffs.join("; ")}`);
  });
}
const ids = new Set(strengths.map((r) => r.id));
console.log(`strength rows: ${strengths.length} (expected ${expected}); unique ids: ${ids.size}; unique SKUs: ${new Set(strengths.map((r) => r.sku)).size}`);
const sample = strengths.find((r) => r.product_slug === "bpc-157");
console.log("sample bpc-157 bulk_tiers as stored:", JSON.stringify(sample?.bulk_tiers), "| in products.sizes:", JSON.stringify(JSON.parse(products.find((p) => p.slug === "bpc-157").sizes)[0].bulkTiers));
console.log(problems.length ? `MISMATCHES:\n  ${problems.join("\n  ")}` : "All rows match their source sizes field by field (JSON compared by value).");
