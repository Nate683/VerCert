// Catalog expansion, October 2026: 31 new products plus size changes to five
// existing ones. Runs after `npm run db:migrate` has made the chemical fields
// and category nullable AND after the code that reads null has shipped.
//
//   node scripts/catalog-expansion.mjs           # dry run: prints the plan
//   node scripts/catalog-expansion.mjs --apply   # writes, in one transaction
//
// Safe to re-run: existing products are skipped, and sizes are only added if
// their label isn't already there.
//
// Every new product is created INACTIVE with every size unpriced (null), and
// with no chemical data, batch numbers or COA records — none of that has been
// supplied, and none of it is invented here.
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });

import { randomUUID } from "crypto";
import { neon } from "@neondatabase/serverless";

const APPLY = process.argv.includes("--apply");
const ACTOR = "script:catalog-expansion";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not set in .env.local.");
  process.exit(1);
}
const sql = neon(connectionString);

const LYO = "Lyophilized Peptides";
const BLEND = "Peptide Blends";
const SMALL = "Small Molecules";
const LAB = "Lab Supplies";

const size = (label, composition) => ({ label, priceUsd: null, ...(composition ? { composition } : {}) });
const part = (name, amount) => ({ name, amount });

const NEW_PRODUCTS = [
  { slug: "5-amino-1mq", name: "5-Amino-1MQ", category: SMALL, sizes: [size("10mg")] },
  { slug: "ahk-cu", name: "AHK-Cu", category: LYO, sizes: [size("50mg")] },
  { slug: "aod-9604", name: "AOD-9604", category: LYO, sizes: [size("10mg")] },
  { slug: "ara-290", name: "ARA-290", category: LYO, sizes: [size("10mg")] },
  { slug: "bac-water", name: "BAC Water", category: LAB, sizes: [size("10ml")] },
  { slug: "cartalax", name: "Cartalax", category: LYO, sizes: [size("20mg")] },
  { slug: "cjc-1295-no-dac", name: "CJC-1295 without DAC", category: LYO, sizes: [size("10mg")] },
  { slug: "dihexa", name: "Dihexa", category: SMALL, sizes: [size("10mg")] },
  { slug: "dsip", name: "DSIP", category: LYO, sizes: [size("10mg")] },
  { slug: "epithalon", name: "Epithalon", category: LYO, sizes: [size("10mg")] },
  { slug: "foxo4-dri", name: "FOXO4-DRI", category: LYO, sizes: [size("10mg")] },
  {
    slug: "glow-blend",
    name: "GLOW Blend",
    category: BLEND,
    sizes: [size("70mg", [part("BPC-157", "10mg"), part("GHK-Cu", "50mg"), part("TB-500", "10mg")])],
  },
  { slug: "glutathione", name: "Glutathione", category: SMALL, sizes: [size("1500mg")] },
  { slug: "humanin", name: "Humanin", category: LYO, sizes: [size("10mg")] },
  { slug: "igf-1-lr3", name: "IGF-1 LR3", category: LYO, sizes: [size("1mg")] },
  { slug: "kisspeptin-10", name: "Kisspeptin-10", category: LYO, sizes: [size("5mg")] },
  {
    slug: "klow-blend",
    name: "KLOW Blend",
    category: BLEND,
    sizes: [
      size("80mg", [part("BPC-157", "10mg"), part("GHK-Cu", "50mg"), part("TB-500", "10mg"), part("KPV", "10mg")]),
    ],
  },
  { slug: "kpv", name: "KPV", category: LYO, sizes: [size("10mg")] },
  { slug: "ll-37", name: "LL-37", category: LYO, sizes: [size("5mg")] },
  { slug: "nad-plus", name: "NAD+", category: SMALL, sizes: [size("500mg")] },
  { slug: "pinealon", name: "Pinealon", category: LYO, sizes: [size("10mg")] },
  { slug: "pt-141", name: "PT-141", category: LYO, sizes: [size("10mg")] },
  {
    slug: "semax-selank-blend",
    name: "Semax / Selank Blend",
    category: BLEND,
    sizes: [size("20mg", [part("Semax", "10mg"), part("Selank", "10mg")])],
  },
  { slug: "sermorelin", name: "Sermorelin", category: LYO, sizes: [size("10mg")] },
  { slug: "slu-pp-332", name: "SLU-PP-332", category: SMALL, sizes: [size("5mg")] },
  { slug: "ss-31", name: "SS-31", category: LYO, sizes: [size("10mg")] },
  { slug: "thymosin-alpha-1", name: "Thymosin Alpha-1", category: LYO, sizes: [size("10mg")] },
  // VC1S / VC2T / VC3R: uncategorized until the owner says what they are.
  { slug: "vc1s", name: "VC1S", category: null, sizes: [size("10mg")] },
  { slug: "vc2t", name: "VC2T", category: null, sizes: [size("10mg"), size("20mg")] },
  { slug: "vc3r", name: "VC3R", category: null, alternateNames: ["GLP3RT"], sizes: [size("10mg"), size("20mg")] },
  // Composition not yet supplied — flagged in the report.
  { slug: "wolverine-blend", name: "WOLVERINE Blend", category: BLEND, sizes: [size("20mg")] },
];

// Changes to existing products' sizes. `relabel` renames a priced size in
// place (keeping its price); `add` appends unpriced sizes; `composition` is
// set on the size with that label.
const SIZE_CHANGES = [
  { slug: "semax", add: [size("11mg")] },
  { slug: "selank", add: [size("11mg")] },
  { slug: "mots-c", add: [size("20mg"), size("40mg")] },
  {
    // "10mg / 10mg" was per compound; sizes are now the vial's total mass.
    slug: "cjc-1295-ipamorelin-blend",
    relabel: { from: "10mg / 10mg", to: "20mg" },
    add: [size("10mg", [part("CJC-1295", "5mg"), part("Ipamorelin", "5mg")])],
    composition: { "20mg": [part("CJC-1295", "10mg"), part("Ipamorelin", "10mg")] },
    order: ["10mg", "20mg"],
  },
  {
    slug: "bpc-157-tb-500-blend",
    relabel: { from: "10mg / 10mg", to: "20mg" },
    composition: { "20mg": [part("BPC-157", "10mg"), part("TB-500", "10mg")] },
  },
];

const RETIRE = ["cjc-1295-dac"];

async function main() {
  // Refuse to run before the constraints are relaxed: inserting nulls would fail
  // halfway through the plan anyway, but fail before printing a plan instead.
  const nullable = await sql`
    SELECT column_name, is_nullable FROM information_schema.columns
     WHERE table_name = 'products'
       AND column_name IN ('cas_number','molecular_formula','molecular_weight','purity_percent','category','alternate_names')`;
  const notReady = ["cas_number", "molecular_formula", "molecular_weight", "purity_percent", "category", "alternate_names"].filter(
    (c) => nullable.find((r) => r.column_name === c)?.is_nullable !== "YES"
  );
  if (notReady.length > 0) {
    console.error(`Run \`npm run db:migrate\` first — not nullable or missing: ${notReady.join(", ")}`);
    process.exit(1);
  }

  const existing = await sql`SELECT slug, name, sizes, active, sort_order FROM products`;
  const bySlug = new Map(existing.map((r) => [r.slug, r]));
  const now = new Date().toISOString();
  const statements = [];
  const log = (action, details) =>
    statements.push(
      sql`INSERT INTO activity_log (id, actor_email, action, details, created_at) VALUES (${randomUUID()}, ${ACTOR}, ${action}, ${details}, ${now})`
    );
  const plan = [];

  // 1. Placeholders → null. '' and 0 were only ever there because the columns
  //    couldn't be empty.
  const placeholderCounts = await sql`
    SELECT
      count(*) FILTER (WHERE trim(cas_number) = '') AS cas,
      count(*) FILTER (WHERE trim(molecular_formula) = '') AS formula,
      count(*) FILTER (WHERE trim(molecular_weight) = '') AS weight,
      count(*) FILTER (WHERE purity_percent <= 0) AS purity
    FROM products`;
  plan.push(`Clear placeholders → null: ${JSON.stringify(placeholderCounts[0])}`);
  statements.push(sql`UPDATE products SET cas_number = NULL WHERE trim(cas_number) = ''`);
  statements.push(sql`UPDATE products SET molecular_formula = NULL WHERE trim(molecular_formula) = ''`);
  statements.push(sql`UPDATE products SET molecular_weight = NULL WHERE trim(molecular_weight) = ''`);
  statements.push(sql`UPDATE products SET purity_percent = NULL WHERE purity_percent <= 0`);

  // 2. Retire.
  for (const slug of RETIRE) {
    const row = bySlug.get(slug);
    if (!row) plan.push(`SKIP retire ${slug}: not found`);
    else if (!row.active) plan.push(`SKIP retire ${slug}: already inactive`);
    else {
      plan.push(`Retire ${slug} (${row.name}) → inactive`);
      statements.push(sql`UPDATE products SET active = FALSE, updated_at = ${now} WHERE slug = ${slug}`);
      log("product.updated", `${slug}: retired (set inactive) — catalog expansion`);
    }
  }

  // 3. Size changes on existing products.
  for (const change of SIZE_CHANGES) {
    const row = bySlug.get(change.slug);
    if (!row) {
      plan.push(`SKIP sizes ${change.slug}: not found`);
      continue;
    }
    let sizes = JSON.parse(row.sizes);
    const before = JSON.stringify(sizes);
    if (change.relabel) {
      sizes = sizes.map((s) => (s.label === change.relabel.from ? { ...s, label: change.relabel.to } : s));
    }
    for (const add of change.add ?? []) {
      if (!sizes.some((s) => s.label === add.label)) sizes.push(add);
    }
    for (const [label, composition] of Object.entries(change.composition ?? {})) {
      sizes = sizes.map((s) => (s.label === label ? { ...s, composition } : s));
    }
    if (change.order) {
      sizes.sort((a, b) => change.order.indexOf(a.label) - change.order.indexOf(b.label));
    }
    const after = JSON.stringify(sizes);
    if (after === before) {
      plan.push(`SKIP sizes ${change.slug}: already up to date`);
      continue;
    }
    plan.push(`Sizes ${change.slug}: ${describe(JSON.parse(before))}  →  ${describe(sizes)}`);
    statements.push(sql`UPDATE products SET sizes = ${after}, updated_at = ${now} WHERE slug = ${change.slug}`);
    log("product.updated", `${change.slug}: sizes ${describe(sizes)} — catalog expansion`);
  }

  // 4. New products.
  let sortOrder = Math.max(-1, ...existing.map((r) => r.sort_order)) + 1;
  for (const p of NEW_PRODUCTS) {
    if (bySlug.has(p.slug)) {
      plan.push(`SKIP create ${p.slug}: already exists`);
      continue;
    }
    plan.push(`Create ${p.slug} "${p.name}" [${p.category ?? "UNCATEGORIZED"}] ${describe(p.sizes)} INACTIVE`);
    statements.push(sql`
      INSERT INTO products
        (slug, name, category, alternate_names, cas_number, molecular_formula, molecular_weight, purity_percent,
         sequence_or_form, storage, sizes, batch_numbers, summary, description, sort_order, active, cost_usd,
         created_at, updated_at)
      VALUES
        (${p.slug}, ${p.name}, ${p.category}, ${p.alternateNames ? JSON.stringify(p.alternateNames) : null},
         NULL, NULL, NULL, NULL,
         '', '', ${JSON.stringify(p.sizes)}, '[]', '', '[]', ${sortOrder++}, FALSE, NULL,
         ${now}, ${now})`);
    log("product.created", `${p.name} (${p.slug}) — inactive, unpriced — catalog expansion`);
  }

  console.log(plan.join("\n"));
  if (!APPLY) {
    console.log(`\nDry run: ${statements.length} statements not executed. Re-run with --apply.`);
    return;
  }
  await sql.transaction(statements);
  console.log(`\nApplied ${statements.length} statements in one transaction.`);
}

function describe(sizes) {
  return sizes
    .map((s) => {
      const price = s.priceUsd === null || s.priceUsd === undefined ? "unpriced" : `$${s.priceUsd}`;
      const mix = s.composition ? ` = ${s.composition.map((c) => `${c.name} ${c.amount}`).join(" + ")}` : "";
      return `${s.label} (${price}${mix})`;
    })
    .join(", ");
}

main().catch((err) => {
  console.error("[catalog-expansion] Failed:", err);
  process.exit(1);
});
