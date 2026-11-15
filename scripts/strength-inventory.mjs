// Stage 2 (inventory management): per-strength inventory, an append-only movement history, and normalized
// uniqueness for strengths and SKU codes. Run against production only once the owner has approved, and BEFORE
// pushing the code that reads these tables.
//
//   node scripts/strength-inventory.mjs                       # dry run: read-only; prints the plan and every opening balance
//   node scripts/strength-inventory.mjs --apply               # applies, in one transaction
//   node scripts/strength-inventory.mjs --zero=SKU[,SKU...]   # (with or without --apply) open the named SKUs at 0
//                                                             # instead of the shared count they draw on today
//
// What it does:
// - CREATE TABLE strength_inventory: one row per strength (keyed by its permanent id): physical_quantity,
//   reserved_quantity (always 0 in Stage 2 — nothing increments it), low_stock_threshold, version, timestamps.
//   Available to sell = physical − reserved, computed, never stored. CHECKs keep physical ≥ 0, reserved ≥ 0 and
//   reserved ≤ physical, so available can never be negative.
// - CREATE TABLE inventory_movements: append-only (a trigger rejects UPDATE and DELETE). Each row: strength id plus
//   a snapshot of SKU/product/label, type, change, previous and resulting quantity (CHECK resulting = previous +
//   change, resulting ≥ 0), reason, note, actor, reference, idempotency key (unique), timestamp.
// - Two unique indexes on product_strengths: (product, label ignoring case and whitespace) and upper(sku). The
//   exact-match indexes from Stage 1 stay.
// - Opening balances: each strength's quantity and threshold are what the storefront computes for it TODAY
//   (lib/inventory.ts resolveRow): its own inventory row if it has one, else its product's shared ('') row, else 0
//   with threshold 10. One 'opening_balance' movement per strength records where the number came from.
//
// What it does NOT do: it writes no existing row. inventory (left as the frozen legacy copy), products,
// product_strengths, orders and every certificate table are fingerprinted before and after. Shared rows that no
// strength draws on, and rows for products that no longer exist, are listed and left exactly as they are.
//
// Recovery: additive. DROP TABLE inventory_movements, strength_inventory; DROP INDEX the two new indexes. The legacy
// inventory table is untouched, so the pre-Stage-2 code still reads its old numbers.
// Safe to re-run: once strength_inventory exists, nothing is written.
import { randomUUID } from "crypto";
import { pathToFileURL } from "url";

const DEFAULT_THRESHOLD = 10;
const STATEMENTS = [
  `CREATE TABLE strength_inventory (
     strength_id TEXT PRIMARY KEY REFERENCES product_strengths(id) ON DELETE RESTRICT,
     physical_quantity INTEGER NOT NULL CHECK (physical_quantity >= 0),
     reserved_quantity INTEGER NOT NULL DEFAULT 0 CHECK (reserved_quantity >= 0),
     low_stock_threshold INTEGER NOT NULL CHECK (low_stock_threshold >= 0),
     version INTEGER NOT NULL DEFAULT 0,
     created_at TEXT NOT NULL,
     updated_at TEXT NOT NULL,
     CONSTRAINT strength_inventory_reserved_within_physical CHECK (reserved_quantity <= physical_quantity)
   )`,
  `CREATE TABLE inventory_movements (
     id TEXT PRIMARY KEY,
     strength_id TEXT NOT NULL REFERENCES product_strengths(id) ON DELETE RESTRICT,
     sku TEXT NOT NULL,
     product_slug TEXT NOT NULL,
     strength_label TEXT NOT NULL,
     movement_type TEXT NOT NULL CHECK (movement_type IN
       ('opening_balance', 'stock_received', 'stock_removed', 'count_correction', 'threshold_changed', 'order_deducted', 'order_restored')),
     quantity_change INTEGER NOT NULL,
     previous_quantity INTEGER NOT NULL CHECK (previous_quantity >= 0),
     resulting_quantity INTEGER NOT NULL CHECK (resulting_quantity >= 0),
     reason TEXT NOT NULL CHECK (length(trim(reason)) > 0),
     note TEXT,
     actor TEXT NOT NULL,
     reference TEXT,
     idempotency_key TEXT UNIQUE,
     created_at TEXT NOT NULL,
     CONSTRAINT inventory_movements_arithmetic CHECK (resulting_quantity = previous_quantity + quantity_change)
   )`,
  "CREATE INDEX inventory_movements_strength ON inventory_movements (strength_id, created_at DESC)",
  "CREATE INDEX inventory_movements_created ON inventory_movements (created_at DESC)",
  `CREATE FUNCTION inventory_movements_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
   BEGIN RAISE EXCEPTION 'inventory_movements is append-only: % is not allowed', TG_OP; END $$`,
  `CREATE TRIGGER inventory_movements_no_update_delete BEFORE UPDATE OR DELETE ON inventory_movements
     FOR EACH ROW EXECUTE FUNCTION inventory_movements_append_only()`,
  "CREATE UNIQUE INDEX product_strengths_product_label_norm ON product_strengths (product_slug, lower(regexp_replace(label, '\\s', '', 'g')))",
  "CREATE UNIQUE INDEX product_strengths_sku_ci ON product_strengths (upper(sku))",
  "COMMENT ON TABLE strength_inventory IS 'Stage 2: stock per strength (permanent id). Available to sell = physical_quantity - reserved_quantity. reserved_quantity is never incremented in Stage 2.'",
  "COMMENT ON TABLE inventory_movements IS 'Stage 2: append-only stock history (UPDATE/DELETE rejected by trigger).'",
  "COMMENT ON TABLE inventory IS 'LEGACY (frozen 2026-11 by Stage 2): no longer read or written by the application; kept for rollback. Stock now lives in strength_inventory.'",
];

async function snapshot(sql) {
  const [fp] = await sql`
    SELECT
      (SELECT md5(coalesce(string_agg(to_jsonb(i)::text, '|' ORDER BY slug, size_label), '')) FROM inventory i) AS inventory,
      (SELECT md5(coalesce(string_agg(to_jsonb(p)::text, '|' ORDER BY slug), '')) FROM products p) AS products,
      (SELECT md5(coalesce(string_agg(to_jsonb(s)::text, '|' ORDER BY id), '')) FROM product_strengths s) AS product_strengths,
      (SELECT md5(coalesce(string_agg(to_jsonb(o)::text, '|' ORDER BY id), '')) FROM orders o) AS orders,
      (SELECT md5(coalesce(string_agg(to_jsonb(r)::text, '|' ORDER BY id), '')) FROM coa_records r) AS coa_records,
      (SELECT md5(coalesce(string_agg(to_jsonb(l)::text, '|' ORDER BY id), '')) FROM coa_lots l) AS coa_lots`;
  const [{ exists }] = await sql`SELECT to_regclass('public.strength_inventory') IS NOT NULL AS exists`;
  return { fp, exists };
}

export async function run(sql, { apply = false, zero = [], log: print = console.log } = {}) {
  const before = await snapshot(sql);
  print("BEFORE fingerprints:", JSON.stringify(before.fp));
  if (before.exists) { print("strength_inventory already exists. Nothing to do."); return { applied: false }; }

  const inv = await sql`SELECT slug, size_label, quantity, threshold FROM inventory ORDER BY slug, size_label`;
  const strengths = await sql`SELECT id, product_slug, label, sku, active FROM product_strengths ORDER BY product_slug, position`;
  const norm = (s) => s.toLowerCase().replace(/\s+/g, "");

  // Uniqueness preconditions for the two new indexes.
  const dupLabel = [], dupSku = [];
  const seenL = new Map(), seenS = new Map();
  for (const s of strengths) {
    const kl = `${s.product_slug}|${norm(s.label)}`; if (seenL.has(kl)) dupLabel.push(`${s.product_slug}: "${seenL.get(kl)}" / "${s.label}"`); seenL.set(kl, s.label);
    const ks = s.sku.toUpperCase(); if (seenS.has(ks)) dupSku.push(`${seenS.get(ks)} / ${s.sku}`); seenS.set(ks, s.sku);
  }

  // Opening balances: exactly what resolveRow gives each strength today.
  const now = new Date().toISOString();
  const rows = strengths.map((s) => {
    const own = inv.find((r) => r.slug === s.product_slug && r.size_label === s.label);
    const shared = inv.find((r) => r.slug === s.product_slug && r.size_label === "");
    const siblingsOnShared = strengths.filter((x) => x.product_slug === s.product_slug && !inv.some((r) => r.slug === x.product_slug && r.size_label === x.label));
    let quantity = 0, threshold = DEFAULT_THRESHOLD, source = "none (no inventory row): opened at 0";
    if (own) { quantity = own.quantity; threshold = own.threshold; source = `own row ${s.product_slug}|${s.label}`; }
    else if (shared) {
      if (siblingsOnShared.length > 1) source = "AMBIGUOUS";
      else { quantity = shared.quantity; threshold = shared.threshold; source = `shared row ${s.product_slug}|'' (its only user)`; }
    }
    const zeroed = zero.includes(s.sku);
    if (zeroed) { source += ` — OPENED AT 0 by --zero (today: ${quantity})`; quantity = 0; }
    return { ...s, quantity, threshold, source, own: Boolean(own), zeroed };
  });
  const ambiguous = rows.filter((r) => r.source === "AMBIGUOUS");
  const fromShared = rows.filter((r) => r.source.startsWith("shared row"));
  const usedRows = new Set(rows.flatMap((r) => (r.own ? [`${r.product_slug}|${r.label}`] : r.source.startsWith("shared row") ? [`${r.product_slug}|`] : [])));
  const notCarried = inv.filter((r) => !usedRows.has(`${r.slug}|${r.size_label}`));
  const slugs = new Set(strengths.map((s) => s.product_slug));

  print(`\nPLAN: create strength_inventory + inventory_movements (append-only trigger) + 2 indexes on inventory_movements;`);
  print(`      2 unique indexes on product_strengths (label ignoring case/space; upper(sku)); table comments;`);
  print(`      insert ${rows.length} strength_inventory rows (reserved = 0) and ${rows.length} 'opening_balance' movements.`);
  print(`\nuniqueness preconditions: duplicate strengths ${dupLabel.length ? dupLabel.join("; ") : "none"}; duplicate SKU codes ${dupSku.length ? dupSku.join("; ") : "none"}`);
  print(`\nopening balances (sku · active · qty · threshold · source):`);
  for (const r of rows) print(`  ${r.sku} · ${r.active ? "active" : "DEACTIVATED"} · ${r.quantity} · ${r.threshold} · ${r.source}`);
  print(`\ntotals: ${rows.length} strengths; ${rows.filter((r) => r.own).length} from their own row, ${fromShared.length} from a shared row, ${rows.filter((r) => r.source.startsWith("none")).length} with no row (0); total physical ${rows.reduce((a, r) => a + r.quantity, 0)}`);
  print(`needs owner confirmation (opened from a product-level shared row): ${fromShared.map((r) => `${r.sku}=${r.quantity}${r.active ? "" : " (deactivated)"}`).join(", ") || "none"}`);
  print(`AMBIGUOUS (several strengths share one count — not distributable): ${ambiguous.map((r) => r.sku).join(", ") || "none"}`);
  print(`legacy rows not carried (left untouched): ${notCarried.map((r) => `${r.slug}|${r.size_label || "''"}=${r.quantity}${slugs.has(r.slug) ? "" : " (no such product)"}`).join(", ") || "none"}`);
  print(`  of which non-zero: ${notCarried.filter((r) => r.quantity > 0).map((r) => `${r.slug}|${r.size_label || "''"}=${r.quantity}`).join(", ") || "none"}`);

  const blockers = [...(dupLabel.length ? ["duplicate strengths"] : []), ...(dupSku.length ? ["duplicate SKUs"] : []), ...(ambiguous.length ? ["ambiguous shared stock"] : [])];
  if (blockers.length) { print(`\nSTOPPED: ${blockers.join(", ")}. Nothing executed.`); return { applied: false, blockers }; }
  if (!apply) { print("\nDry run: nothing executed. Re-run with --apply."); return { applied: false, rows }; }

  await sql.transaction([
    ...STATEMENTS.map((q) => sql.query(q)),
    ...rows.flatMap((r) => [
      sql.query("INSERT INTO strength_inventory (strength_id, physical_quantity, reserved_quantity, low_stock_threshold, version, created_at, updated_at) VALUES ($1, $2, 0, $3, 0, $4, $4)",
        [r.id, r.quantity, r.threshold, now]),
      sql.query(`INSERT INTO inventory_movements (id, strength_id, sku, product_slug, strength_label, movement_type, quantity_change, previous_quantity, resulting_quantity, reason, note, actor, reference, idempotency_key, created_at)
                 VALUES ($1, $2, $3, $4, $5, 'opening_balance', $6, 0, $6, 'Stage 2 migration: opening balance', $7, 'system:migration', $8, $9, $10)`,
        [randomUUID(), r.id, r.sku, r.product_slug, r.label, r.quantity, r.source, r.own ? `inventory:${r.product_slug}|${r.label}` : r.source.startsWith("shared row") ? `inventory:${r.product_slug}|` : null, `opening:${r.id}`, now]),
    ]),
  ]);

  const after = await snapshot(sql);
  const stored = await sql`SELECT si.strength_id, si.physical_quantity, si.reserved_quantity, si.low_stock_threshold, m.quantity_change, m.resulting_quantity
                             FROM strength_inventory si JOIN inventory_movements m ON m.strength_id = si.strength_id AND m.movement_type = 'opening_balance'`;
  const problems = [];
  for (const k of Object.keys(before.fp)) if (before.fp[k] !== after.fp[k]) problems.push(`${k} changed`);
  if (stored.length !== rows.length) problems.push(`expected ${rows.length} rows, found ${stored.length}`);
  for (const r of rows) {
    const s = stored.find((x) => x.strength_id === r.id);
    if (!s || Number(s.physical_quantity) !== r.quantity || Number(s.reserved_quantity) !== 0 || Number(s.low_stock_threshold) !== r.threshold || Number(s.resulting_quantity) !== r.quantity)
      problems.push(`${r.sku} stored differently`);
  }
  let triggerWorks = false;
  try { await sql.query("UPDATE inventory_movements SET note = note WHERE false"); } catch { /* a WHERE false update never fires the row trigger */ }
  try { await sql.transaction([sql.query("DELETE FROM inventory_movements WHERE id = (SELECT id FROM inventory_movements LIMIT 1)")]); } catch { triggerWorks = true; }
  if (!triggerWorks) problems.push("append-only trigger did not reject a DELETE");
  print("\nAFTER fingerprints:", JSON.stringify(after.fp));
  print(problems.length ? `\nCHECK FAILED: ${problems.join("; ")}` : `\nChecks passed: ${rows.length} opening balances stored exactly as planned (reserved 0); history is append-only (a DELETE was rejected); inventory, products, product_strengths, orders and certificate tables unchanged.`);
  return { applied: true, problems };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { config } = await import("dotenv");
  config({ path: ".env.local", quiet: true });
  const { neon } = await import("@neondatabase/serverless");
  if (!process.env.DATABASE_URL) { console.error("DATABASE_URL is not set in .env.local."); process.exit(1); }
  const zero = (process.argv.find((a) => a.startsWith("--zero=")) ?? "").slice(7).split(",").filter(Boolean);
  run(neon(process.env.DATABASE_URL), { apply: process.argv.includes("--apply"), zero }).catch((err) => {
    console.error("[strength-inventory] Failed:", err.message ?? err);
    process.exit(1);
  });
}
