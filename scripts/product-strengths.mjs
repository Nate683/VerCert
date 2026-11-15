// Stage 1 (strength-specific SKUs): adds the product_strengths table and fills it with one row per existing size.
// Run it against production only once the owner has approved, and BEFORE pushing the code that reads the table.
//
//   node scripts/product-strengths.mjs           # dry run: read-only; prints the current data and exactly what would be inserted
//   node scripts/product-strengths.mjs --apply   # creates the table and inserts the rows, in one transaction
//
// What it does:
// - CREATE TABLE product_strengths: one row per strength of a product, with a permanent id (never regenerated, kept
//   through renames, price/image/status changes and deactivation), a SKU code, and the strength's own price, cost,
//   bulk tiers, blend composition, availability status, optional estimated availability date, vial image and
//   active flag.
// - Backfill: one row per entry in each product's existing `sizes` JSON, in the same order, carrying that size's
//   label, price, cost, bulk tiers and composition unchanged. Each strength starts with the product's current
//   availability status and estimated date (so nothing a customer sees changes), no image of its own (the product
//   image is the fallback), and active = true.
// - SKU code: the convention the certificate system already uses (lib/coa/admin.ts, lib/coa/public.ts):
//   upper("<slug>-<label>") with whitespace removed, e.g. BPC-157-10MG. A collision gets "-2", "-3"… and is listed.
//
// What it does NOT do: it writes no existing row. products (including products.sizes, availability_status and
// estimated_available_on), inventory, orders, subscriptions and every certificate table are left exactly as they
// are; the script fingerprints them before and after and fails if any changed. No foreign key is added, so product
// deletion and every existing write path behave as before.
//
// Recovery: the change is additive. To undo it, DROP TABLE product_strengths; no existing data needs restoring.
// Safe to re-run: once the table exists, nothing is written.
import { randomUUID } from "crypto";
import { pathToFileURL } from "url";

const STATUSES = ["coming_soon", "pending_testing", "in_stock", "out_of_stock"];
export const skuOf = (slug, label) => `${slug}-${label}`.toUpperCase().replace(/\s+/g, "");

const CREATE = `
  CREATE TABLE IF NOT EXISTS product_strengths (
    id TEXT PRIMARY KEY,
    product_slug TEXT NOT NULL,
    label TEXT NOT NULL,
    sku TEXT NOT NULL,
    position INTEGER NOT NULL,
    active BOOLEAN NOT NULL,
    availability_status TEXT NOT NULL CHECK (availability_status IN ('coming_soon', 'pending_testing', 'in_stock', 'out_of_stock')),
    estimated_available_on DATE,
    image_url TEXT,
    price_usd DOUBLE PRECISION CHECK (price_usd IS NULL OR price_usd >= 0),
    cost_usd DOUBLE PRECISION CHECK (cost_usd IS NULL OR cost_usd >= 0),
    bulk_tiers JSONB,
    composition JSONB,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`;
const INDEXES = [
  "CREATE UNIQUE INDEX IF NOT EXISTS product_strengths_sku ON product_strengths (sku)",
  "CREATE UNIQUE INDEX IF NOT EXISTS product_strengths_product_label ON product_strengths (product_slug, label)",
  "CREATE INDEX IF NOT EXISTS product_strengths_product ON product_strengths (product_slug, position)",
];
const COMMENT =
  "One row per product strength (SKU). id is permanent: never regenerated or reused. Stage 1, 2026-11-14.";

async function snapshot(sql) {
  const [fp] = await sql`
    SELECT
      (SELECT md5(coalesce(string_agg(to_jsonb(p)::text, '|' ORDER BY slug), '')) FROM products p) AS products,
      (SELECT md5(coalesce(string_agg(to_jsonb(i)::text, '|' ORDER BY slug, size_label), '')) FROM inventory i) AS inventory,
      (SELECT md5(coalesce(string_agg(to_jsonb(o)::text, '|' ORDER BY id), '')) FROM orders o) AS orders,
      (SELECT md5(coalesce(string_agg(to_jsonb(s)::text, '|' ORDER BY id), '')) FROM subscriptions s) AS subscriptions,
      (SELECT md5(coalesce(string_agg(to_jsonb(r)::text, '|' ORDER BY id), '')) FROM coa_records r) AS coa_records,
      (SELECT md5(coalesce(string_agg(to_jsonb(l)::text, '|' ORDER BY id), '')) FROM coa_lots l) AS coa_lots,
      (SELECT md5(coalesce(string_agg(id || ':' || sha256, '|' ORDER BY id), '')) FROM coa_files) AS coa_files`;
  const [counts] = await sql`
    SELECT (SELECT count(*)::int FROM products) AS products, (SELECT count(*)::int FROM inventory) AS inventory,
           (SELECT count(*)::int FROM orders) AS orders, (SELECT count(*)::int FROM subscriptions) AS subscriptions,
           (SELECT count(*)::int FROM coa_records) AS coa_records`;
  const [{ exists }] = await sql`SELECT to_regclass('public.product_strengths') IS NOT NULL AS exists`;
  return { fp, counts, exists };
}

// The rows the backfill would insert, from the current products.sizes JSON.
function plan(products, now) {
  const rows = [];
  const problems = [];
  const used = new Set();
  for (const p of products) {
    let sizes;
    try { sizes = JSON.parse(p.sizes); } catch { problems.push(`${p.slug}: sizes is not valid JSON`); continue; }
    if (!Array.isArray(sizes)) { problems.push(`${p.slug}: sizes is not a list`); continue; }
    const labels = new Set();
    sizes.forEach((s, position) => {
      const label = String(s?.label ?? "");
      if (!label.trim()) problems.push(`${p.slug}: size #${position + 1} has no label`);
      if (labels.has(label)) problems.push(`${p.slug}: label "${label}" appears twice`);
      labels.add(label);
      const base = skuOf(p.slug, label);
      let sku = base, n = 2;
      while (used.has(sku)) sku = `${base}-${n++}`;
      used.add(sku);
      const status = STATUSES.includes(p.availability_status) ? p.availability_status : "coming_soon";
      rows.push({
        id: randomUUID(), product_slug: p.slug, label, sku, skuCollision: sku !== base, position, active: true,
        availability_status: status, estimated_available_on: p.estimated_available_on ?? null, image_url: null,
        price_usd: typeof s.priceUsd === "number" ? s.priceUsd : null,
        cost_usd: typeof s.costUsd === "number" ? s.costUsd : null,
        bulk_tiers: Array.isArray(s.bulkTiers) && s.bulkTiers.length ? s.bulkTiers : null,
        composition: Array.isArray(s.composition) && s.composition.length ? s.composition : null,
        created_at: now, updated_at: now,
        // Keys on the size that are not carried over (none are expected; listed so nothing is lost silently).
        extraKeys: Object.keys(s ?? {}).filter((k) => !["label", "priceUsd", "costUsd", "bulkTiers", "composition"].includes(k)),
      });
    });
  }
  return { rows, problems };
}

const canon = (v) => (Array.isArray(v) ? v.map(canon) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v);
const sameJson = (a, b) => JSON.stringify(canon(a ?? null)) === JSON.stringify(canon(b ?? null));
const dateText = (d) => (d == null ? null : typeof d === "string" ? d.slice(0, 10) : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);

export async function run(sql, { apply = false, log: print = console.log } = {}) {
  const before = await snapshot(sql);
  print("BEFORE");
  print(`  counts: ${JSON.stringify(before.counts)}`);
  print(`  fingerprints: ${JSON.stringify(before.fp)}`);
  if (before.exists) {
    const [{ n }] = await sql`SELECT count(*)::int AS n FROM product_strengths`;
    print(`\nproduct_strengths already exists (${n} rows). Nothing to do.`);
    return { applied: false };
  }

  const products = (await sql`SELECT slug, name, active, availability_status, estimated_available_on, sizes FROM products ORDER BY sort_order, slug`)
    .map((p) => ({ ...p, estimated_available_on: dateText(p.estimated_available_on) }));
  const now = new Date().toISOString();
  const { rows, problems } = plan(products, now);

  // Cross-checks against the other places a strength is referenced by label (read only).
  const inv = await sql`SELECT slug, size_label, quantity FROM inventory ORDER BY slug, size_label`;
  const coa = await sql`SELECT product_slug, size_label, sku, is_test FROM coa_records WHERE deleted_at IS NULL`;
  const subs = await sql`SELECT product_slug, size_label, status FROM subscriptions`;
  const has = (slug, label) => rows.some((r) => r.product_slug === slug && r.label === label);
  const orphanInv = inv.filter((i) => i.size_label !== "" && !has(i.slug, i.size_label));
  const coaRows = coa.map((c) => {
    const row = rows.find((r) => r.product_slug === c.product_slug && r.label === c.size_label);
    return { ...c, strength: row ? row.sku : "(no matching strength)", skuMatches: row ? row.sku === c.sku : false };
  });
  const orphanSubs = subs.filter((s) => !has(s.product_slug, s.size_label));

  print(`\nPLAN: create product_strengths (${INDEXES.length} indexes: unique sku, unique (product, label), (product, position)) and insert ${rows.length} rows from ${products.length} products.`);
  print("  Every row: active = true, image_url = NULL, status and estimated date = the product's current values, price/cost/tiers/composition = the size's current values.");
  print("\n  product · visible · status · est. date · strengths (label → SKU, price)");
  for (const p of products) {
    const rs = rows.filter((r) => r.product_slug === p.slug);
    print(`  ${p.slug} · ${p.active ? "visible" : "hidden"} · ${p.availability_status} · ${p.estimated_available_on ?? "-"} · ${rs.map((r) => `${r.label} → ${r.sku}, ${r.price_usd == null ? "unpriced" : "$" + r.price_usd}${r.bulk_tiers ? ` +${r.bulk_tiers.length} tier(s)` : ""}${r.cost_usd != null ? ", cost" : ""}${r.composition ? ", blend" : ""}`).join("; ")}`);
  }
  const collisions = rows.filter((r) => r.skuCollision);
  const extras = rows.filter((r) => r.extraKeys.length);
  print(`\n  SKU collisions (suffixed): ${collisions.length ? collisions.map((r) => `${r.product_slug} ${r.label} → ${r.sku}`).join("; ") : "none"}`);
  print(`  size keys not carried over: ${extras.length ? extras.map((r) => `${r.product_slug} ${r.label}: ${r.extraKeys.join(",")}`).join("; ") : "none"}`);
  print(`  data problems: ${problems.length ? problems.join("; ") : "none"}`);
  print(`  inventory rows whose size label matches no strength (left alone): ${orphanInv.length ? orphanInv.map((i) => `${i.slug} "${i.size_label}" qty ${i.quantity}`).join("; ") : "none"}`);
  print(`  certificate records (not deleted) vs strengths: ${coaRows.length ? coaRows.map((c) => `${c.product_slug} ${c.size_label} sku ${c.sku ?? "null"} → strength ${c.strength}${c.skuMatches ? " (same SKU)" : ""}${c.is_test ? " [test]" : ""}`).join("; ") : "none"}`);
  print(`  subscriptions whose size matches no strength: ${orphanSubs.length ? orphanSubs.map((s) => `${s.product_slug} ${s.size_label} (${s.status})`).join("; ") : "none"} (of ${subs.length})`);

  if (problems.length) { print("\nSTOPPED: fix the data problems above first."); return { applied: false, problems }; }
  if (!apply) { print("\nDry run: nothing executed. Re-run with --apply."); return { applied: false, rows }; }

  const json = (v) => (v == null ? null : JSON.stringify(v));
  await sql.transaction([
    sql.query(CREATE),
    ...INDEXES.map((q) => sql.query(q)),
    sql.query(`COMMENT ON TABLE product_strengths IS '${COMMENT.replace(/'/g, "''")}'`),
    ...rows.map((r) => sql.query(
      `INSERT INTO product_strengths (id, product_slug, label, sku, position, active, availability_status, estimated_available_on, image_url, price_usd, cost_usd, bulk_tiers, composition, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13::jsonb,$14,$15)`,
      [r.id, r.product_slug, r.label, r.sku, r.position, r.active, r.availability_status, r.estimated_available_on, r.image_url, r.price_usd, r.cost_usd, json(r.bulk_tiers), json(r.composition), r.created_at, r.updated_at])),
  ]);

  const after = await snapshot(sql);
  const stored = await sql`SELECT product_slug, label, sku, position, price_usd, cost_usd, bulk_tiers, composition, availability_status, estimated_available_on, active, image_url FROM product_strengths`;
  const checks = [];
  for (const k of Object.keys(before.fp)) if (before.fp[k] !== after.fp[k]) checks.push(`${k} changed`);
  if (JSON.stringify(before.counts) !== JSON.stringify(after.counts)) checks.push("row counts changed");
  if (stored.length !== rows.length) checks.push(`expected ${rows.length} strengths, found ${stored.length}`);
  for (const r of rows) {
    const s = stored.find((x) => x.product_slug === r.product_slug && x.label === r.label);
    if (!s) { checks.push(`missing ${r.product_slug} ${r.label}`); continue; }
    const same = s.sku === r.sku && s.position === r.position && s.price_usd === r.price_usd && s.cost_usd === r.cost_usd &&
      // JSONB stores object keys in its own order, so compare by value (2026-11-14: a text comparison here falsely
      // failed 19 rows on the production apply; scripts/product-strengths-verify.mjs confirmed every value matched).
      sameJson(s.bulk_tiers, r.bulk_tiers) && sameJson(s.composition, r.composition) &&
      s.availability_status === r.availability_status && dateText(s.estimated_available_on) === r.estimated_available_on && s.active === true && s.image_url === null;
    if (!same) checks.push(`${r.product_slug} ${r.label} stored differently`);
  }
  print("\nAFTER");
  print(`  counts: ${JSON.stringify(after.counts)}`);
  print(`  fingerprints: ${JSON.stringify(after.fp)}`);
  print(checks.length ? `\nCHECK FAILED: ${checks.join("; ")}` : `\nChecks passed: ${stored.length} strengths stored exactly as planned; products, inventory, orders, subscriptions and every certificate table unchanged.`);
  return { applied: true, checks };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { config } = await import("dotenv");
  config({ path: ".env.local", quiet: true });
  const { neon } = await import("@neondatabase/serverless");
  if (!process.env.DATABASE_URL) { console.error("DATABASE_URL is not set in .env.local."); process.exit(1); }
  run(neon(process.env.DATABASE_URL), { apply: process.argv.includes("--apply") }).catch((err) => {
    console.error("[product-strengths] Failed:", err.message ?? err);
    process.exit(1);
  });
}
