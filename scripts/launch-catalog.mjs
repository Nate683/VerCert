// Day-1 launch catalog, October 2026: the 32-SKU launch list with supplier
// costs, retail prices, quantity breaks and opening stock. Runs after
// `npm run db:migrate` has made stock per size AND after the per-size code
// has shipped.
//
//   node scripts/launch-catalog.mjs           # dry run: prints the plan
//   node scripts/launch-catalog.mjs --apply   # writes, in one transaction
//
// Safe to re-run: only what differs from the launch list is written, and a
// stock row that already exists is never overwritten.
//
// Decided with the owner on 2026-10-14:
// - Active flags are never changed. The new product is created inactive.
// - Products already live keep their on-hand stock: the launch quantities
//   haven't arrived. A launch size that is new to a live product starts at 0.
//   Inactive products get the sellable count as their opening stock.
// - GHK-Cu, 5-Amino-1MQ, AOD-9604 and DSIP change strength in place.
// - VC2T is VC-TRZ and VC1S is GLP-1S; GLP3-RT is VC3R. Old codes stay as
//   alternate names so search finds either.
// - No chemical data is written; CAS, formula, weight and purity are untouched.
import { randomUUID } from "crypto";
import { pathToFileURL } from "url";

const ACTOR = "script:launch-catalog";

// rank | product | slug | size label | cost per vial | sellable | order qty | MSRP
// `from` relabels an existing size; blends' labels are the vial's total mass.
export const LAUNCH = [
  [1, "GLP3-RT", "vc3r", "20mg", 12.5, 144, 150, 139.0],
  [2, "BPC-157", "bpc-157", "10mg", 7.0, 124, 130, 64.99],
  [3, "GHK-Cu", "ghk-cu", "100mg", 5.0, 154, 160, 59.99, { from: "50mg" }],
  [4, "GLP3-RT", "vc3r", "10mg", 7.5, 144, 150, 99.0],
  [5, "VC-TRZ", "vc2t", "60mg", 17.5, 74, 80, 199.99],
  [6, "VC-TRZ", "vc2t", "30mg", 10.0, 74, 80, 159.99],
  [7, "TB-500", "tb-500", "10mg", 14.5, 94, 100, 69.0],
  [8, "Tesamorelin", "tesamorelin", "10mg", 18.5, 74, 80, 89.99],
  [9, "MOTS-C", "mots-c", "10mg", 6.5, 94, 100, 59.99],
  [10, "CJC-1295 No DAC / Ipamorelin", "cjc-1295-ipamorelin-blend", "10mg", 10.5, 74, 80, 79.99],
  [11, "Cagrilintide", "cagrilintide", "10mg", 17.5, 74, 80, 124.99],
  [12, "KPV", "kpv", "10mg", 5.5, 94, 100, 69.0],
  [13, "Wolverine Blend", "wolverine-blend", "20mg", 17.5, 64, 70, 134.99],
  [14, "GLOW Blend", "glow-blend", "70mg", 18.0, 64, 70, 149.99],
  [15, "PT-141", "pt-141", "10mg", 6.0, 34, 40, 49.99],
  [16, "Sermorelin", "sermorelin", "10mg", 11.5, 44, 50, 79.99],
  [17, "Semax", "semax", "11mg", 6.0, 44, 50, 59.99],
  [18, "Selank", "selank", "11mg", 6.5, 44, 50, 59.99],
  [19, "SS-31", "ss-31", "10mg", 9.0, 44, 50, 79.99],
  [20, "NAD+", "nad-plus", "500mg", 7.0, 74, 80, 59.99],
  [21, "AOD-9604", "aod-9604", "5mg", 10.0, 74, 80, 44.99, { from: "10mg" }],
  [22, "KLOW Blend", "klow-blend", "80mg", 22.5, 44, 50, 194.99],
  [23, "MT-2", "melanotan-2", "10mg", 5.0, 74, 80, 39.99],
  [24, "Glutathione", "glutathione", "1500mg", 10.5, 74, 80, 115.0],
  [25, "5-Amino-1MQ", "5-amino-1mq", "50mg", 11.0, 44, 50, 49.99, { from: "10mg" }],
  [26, "Epithalon", "epithalon", "10mg", 4.5, 54, 60, 39.99],
  [27, "Thymosin Alpha-1", "thymosin-alpha-1", "10mg", 16.5, 44, 50, 134.99],
  [28, "Ipamorelin", "ipamorelin", "10mg", 7.5, 44, 50, 84.99],
  [29, "IGF-1 LR3", "igf-1-lr3", "1mg", 19.0, 34, 40, 99.99],
  [30, "GLP-1S", "vc1s", "10mg", 4.5, 94, 100, 49.0],
  [31, "DSIP", "dsip", "5mg", 4.0, 34, 40, 44.99, { from: "10mg" }],
  [32, "MT-1", "melanotan-1", "10mg", 5.5, 34, 40, 54.99],
].map(([rank, product, slug, label, cost, sellable, orderQty, msrp, opts = {}]) => ({
  rank, product, slug, label, cost, sellable, orderQty, msrp, ...opts,
}));

// Renames and alternate names. Alternate names are added to, never replaced.
const IDENTITY = {
  vc3r: { name: "GLP3-RT", alternateNames: ["VC3R", "GLP3RT"] },
  vc2t: { name: "VC-TRZ", alternateNames: ["VC2T"], replaceSizes: true },
  vc1s: { name: "GLP-1S", alternateNames: ["VC1S"] },
  "melanotan-1": { alternateNames: ["MT-1"] },
  "melanotan-2": { alternateNames: ["MT-2"] },
  "cjc-1295-ipamorelin-blend": { alternateNames: ["CJC-1295 No DAC / Ipamorelin"] },
};

// Not in the database yet. Category stays null until the owner sets it.
const NEW_PRODUCTS = { cagrilintide: { name: "Cagrilintide", category: null } };

// Quantity breaks: 10% off at 3 units, 15% at 5, 20% at 10, from MSRP.
const BREAKS = [
  [3, 0.1],
  [5, 0.15],
  [10, 0.2],
];
export const cents = (n) => Math.round(n * 100) / 100;
export const bulkTiers = (msrp) => BREAKS.map(([minQuantity, off]) => ({ minQuantity, priceUsd: cents(msrp * (1 - off)) }));

export async function run(sql, { apply = false, log: print = console.log } = {}) {
  const columns = await sql`
    SELECT column_name FROM information_schema.columns WHERE table_name = 'inventory' AND column_name = 'size_label'`;
  const oldKey = await sql`
    SELECT 1 FROM information_schema.table_constraints WHERE table_name = 'inventory' AND constraint_name = 'inventory_pkey'`;
  if (columns.length === 0 || oldKey.length > 0) {
    throw new Error("Run `npm run db:migrate` first: stock isn't per size yet.");
  }

  const existing = await sql`SELECT slug, name, alternate_names, sizes, active, sort_order FROM products`;
  const inventory = await sql`SELECT slug, size_label, quantity FROM inventory`;
  const bySlug = new Map(existing.map((r) => [r.slug, r]));
  const now = new Date().toISOString();
  const statements = [];
  const activity = (action, details) =>
    statements.push(
      sql`INSERT INTO activity_log (id, actor_email, action, details, created_at) VALUES (${randomUUID()}, ${ACTOR}, ${action}, ${details}, ${now})`
    );
  const report = { matches: [], sizeChanges: [], newProducts: [], stock: [], liveStockKept: [], notes: [] };

  let sortOrder = Math.max(-1, ...existing.map((r) => r.sort_order)) + 1;
  for (const [slug, p] of Object.entries(NEW_PRODUCTS)) {
    if (bySlug.has(slug)) continue;
    const sizes = LAUNCH.filter((r) => r.slug === slug).map((r) => ({ label: r.label, priceUsd: null }));
    statements.push(sql`
      INSERT INTO products
        (slug, name, category, alternate_names, cas_number, molecular_formula, molecular_weight, purity_percent,
         sequence_or_form, storage, sizes, batch_numbers, summary, description, sort_order, active, cost_usd,
         created_at, updated_at)
      VALUES
        (${slug}, ${p.name}, ${p.category}, NULL, NULL, NULL, NULL, NULL,
         '', '', ${JSON.stringify(sizes)}, '[]', '', '[]', ${sortOrder++}, FALSE, NULL, ${now}, ${now})`);
    activity("product.created", `${p.name} (${slug}) — inactive — launch catalog`);
    bySlug.set(slug, { slug, name: p.name, alternate_names: null, sizes: JSON.stringify(sizes), active: false, created: true });
  }

  for (const slug of [...new Set(LAUNCH.map((r) => r.slug))]) {
    const row = bySlug.get(slug);
    if (!row) throw new Error(`No product ${slug} — the launch list expects it.`);
    const rows = LAUNCH.filter((r) => r.slug === slug);
    const identity = IDENTITY[slug] ?? {};
    const before = JSON.parse(row.sizes);
    let sizes = identity.replaceSizes ? [] : before.map((s) => ({ ...s }));

    for (const r of rows) {
      const kind = row.created
        ? "new"
        : before.some((s) => s.label === r.label)
          ? "match"
          : r.from && before.some((s) => s.label === r.from)
            ? "relabel"
            : "add";
      const line = `#${r.rank} ${r.product} ${r.label} → ${slug}`;
      if (kind === "new") report.newProducts.push(line);
      else if (kind === "match") report.matches.push(line);
      else if (kind === "relabel") report.sizeChanges.push(`${line} (was ${r.from})`);
      else report.sizeChanges.push(`${line} (new size)`);

      const target = { label: r.label, priceUsd: r.msrp, bulkTiers: bulkTiers(r.msrp), costUsd: r.cost };
      const at = sizes.findIndex((s) => s.label === (kind === "relabel" ? r.from : r.label));
      if (at >= 0) sizes[at] = { ...sizes[at], ...target };
      else sizes.push(target);

      // Opening stock: only where none is recorded for this size yet.
      const own = inventory.find((i) => i.slug === slug && i.size_label === r.label);
      const opening = row.active ? (kind === "match" && isPriced(before, r.label) ? null : 0) : r.sellable;
      if (opening === null) {
        report.liveStockKept.push(`${slug} ${r.label}: kept on-hand (launch sellable ${r.sellable})`);
      } else if (own) {
        report.stock.push(`SKIP ${slug} ${r.label}: stock row exists (${own.quantity})`);
      } else {
        statements.push(
          sql`INSERT INTO inventory (slug, size_label, quantity, threshold) VALUES (${slug}, ${r.label}, ${opening}, 10)`
        );
        activity("inventory.updated", `${slug} ${r.label}: opening stock ${opening} — launch catalog`);
        report.stock.push(`${slug} ${r.label}: ${opening}${row.active ? " (live product; launch stock not on hand yet)" : ""}`);
      }
    }
    if (identity.replaceSizes) {
      const dropped = before.filter((s) => !rows.some((r) => r.label === s.label)).map((s) => s.label);
      if (dropped.length) report.sizeChanges.push(`${slug}: removed sizes ${dropped.join(", ")}`);
      sizes.sort((a, b) => parseFloat(a.label) - parseFloat(b.label));
    }

    const name = identity.name ?? row.name;
    const alternates = JSON.parse(row.alternate_names ?? "[]");
    for (const alt of identity.alternateNames ?? []) if (!alternates.includes(alt)) alternates.push(alt);
    const altJson = alternates.length ? JSON.stringify(alternates) : null;

    const changed = [];
    if (JSON.stringify(sizes) !== JSON.stringify(before)) changed.push(`sizes ${describe(sizes)}`);
    if (name !== row.name) changed.push(`name "${row.name}" → "${name}"`);
    if (altJson !== row.alternate_names) changed.push(`alternate names ${altJson}`);
    if (changed.length === 0) continue;
    statements.push(
      sql`UPDATE products SET name = ${name}, alternate_names = ${altJson}, sizes = ${JSON.stringify(sizes)}, updated_at = ${now} WHERE slug = ${slug}`
    );
    activity("product.updated", `${slug}: ${changed.join("; ")} — launch catalog`);
    print(`Update ${slug}${row.active ? " [LIVE]" : ""}: ${changed.join("; ")}`);
  }

  print(`\nMatches (${report.matches.length}):\n  ${report.matches.join("\n  ")}`);
  print(`\nSize changes (${report.sizeChanges.length}):\n  ${report.sizeChanges.join("\n  ")}`);
  print(`\nNew products (${report.newProducts.length}):\n  ${report.newProducts.join("\n  ")}`);
  print(`\nOpening stock:\n  ${report.stock.join("\n  ")}`);
  print(`\nLive sizes, on-hand stock kept:\n  ${report.liveStockKept.join("\n  ")}`);

  if (!apply) {
    print(`\nDry run: ${statements.length} statements not executed. Re-run with --apply.`);
    return { statements: statements.length, report };
  }
  await sql.transaction(statements);
  print(`\nApplied ${statements.length} statements in one transaction.`);
  return { statements: statements.length, report };
}

function isPriced(sizes, label) {
  return typeof sizes.find((s) => s.label === label)?.priceUsd === "number";
}

function describe(sizes) {
  return sizes
    .map((s) => `${s.label} (${typeof s.priceUsd === "number" ? `$${s.priceUsd}` : "unpriced"}${s.costUsd !== undefined ? `, cost $${s.costUsd}` : ""})`)
    .join(", ");
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { config } = await import("dotenv");
  config({ path: ".env.local", quiet: true });
  const { neon } = await import("@neondatabase/serverless");
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set in .env.local.");
    process.exit(1);
  }
  run(neon(process.env.DATABASE_URL), { apply: process.argv.includes("--apply") }).catch((err) => {
    console.error("[launch-catalog] Failed:", err.message ?? err);
    process.exit(1);
  });
}
