// LOCAL TEST DB ONLY (127.0.0.1:5491). Prints the local facts the Refinements Package 1 tests rely on.
import pg from "pg";
const c = new pg.Client({ host: "127.0.0.1", port: 5491, user: "demo", password: "demo", database: process.argv[2] ?? "demo" });
await c.connect();
const q = async (t) => (await c.query(t)).rows;
console.log("products of interest:", JSON.stringify(await q(`SELECT slug, name, active, cas_number IS NOT NULL AS has_cas, alternate_names FROM products
  WHERE slug IN ('tb-4','tb-500','ghk-cu','bpc-157','kpv','ipamorelin','cjc-1295-no-dac','glow-blend','klow-blend','cjc-1295-ipamorelin-blend','wolverine-blend','semax-selank-blend') ORDER BY slug`)));
console.log("blend strengths:", JSON.stringify(await q(`SELECT product_slug, sku, label, active, price_usd FROM product_strengths WHERE product_slug LIKE '%blend%' ORDER BY 1`)));
console.log("on-sale product count:", JSON.stringify(await q(`SELECT count(DISTINCT p.slug)::int AS n FROM products p JOIN product_strengths s ON s.product_slug = p.slug
  WHERE p.active AND s.active AND s.price_usd IS NOT NULL`)));
console.log("a visible compound with CAS:", JSON.stringify(await q(`SELECT slug, name, cas_number FROM products WHERE active AND cas_number ~ '\\d{2,7}-\\d{2}-\\d' ORDER BY slug LIMIT 3`)));
console.log("policies row:", JSON.stringify(await q(`SELECT key, length(value) AS len FROM site_content WHERE key = 'policies'`)));
console.log("blend tables exist:", JSON.stringify(await q(`SELECT to_regclass('public.blend_compositions') IS NOT NULL AS e`)));
await c.end();
