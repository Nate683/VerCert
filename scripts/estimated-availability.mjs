// Adds products.estimated_available_on: an optional, purpose-built estimated
// availability date for a product. Run it against production only once the
// owner has approved, and BEFORE pushing the code that reads the column.
//
//   node scripts/estimated-availability.mjs           # dry run: prints the counts and the plan
//   node scripts/estimated-availability.mjs --apply   # adds the column, in one transaction
//
// What the column is (and is not):
// - DATE, nullable, no default. Every product starts with no date, so nothing
//   new appears on the storefront until an executive enters one.
// - Purely informational. It is never read by the purchase rule
//   (isPurchasable), the ordering switch, inventory, or visibility, and no
//   job changes a status when the date arrives or passes.
// - Per product, not per size (owner decision 2026-11-12: every size of a
//   product shares one status today). Revisit with per-SKU status.
// - It is not a restock date, a lot date, an expiry, or a created/updated
//   timestamp, and none of those may be copied into it.
//
// Nothing else is written: the script checks that afterwards with a
// fingerprint of every other product column and every inventory row.
// Safe to re-run: once the column exists, nothing is written.
import { pathToFileURL } from "url";

const COLUMN_COMMENT =
  "Optional estimated availability date, entered by an executive. Informational only: never changes status, visibility or purchasing.";

async function counts(sql) {
  const [products] = await sql`
    SELECT count(*)::int AS total,
           count(*) FILTER (WHERE active)::int AS visible,
           count(*) FILTER (WHERE NOT active)::int AS hidden
    FROM products`;
  const byStatus = await sql`
    SELECT availability_status AS status, count(*)::int AS n
    FROM products GROUP BY 1 ORDER BY 1`;
  // Everything except the new column, so the before and after values compare.
  const [fingerprint] = await sql`
    SELECT
      (SELECT md5(coalesce(string_agg((to_jsonb(p) - 'estimated_available_on')::text, '|' ORDER BY slug), ''))
         FROM products p) AS products,
      (SELECT md5(coalesce(string_agg(to_jsonb(i)::text, '|' ORDER BY slug, size_label), ''))
         FROM inventory i) AS inventory`;
  const [{ exists }] = await sql`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'products' AND column_name = 'estimated_available_on'
    ) AS exists`;
  let column = null;
  if (exists) {
    [column] = await sql`
      SELECT c.data_type, c.is_nullable, c.column_default,
             (SELECT count(*)::int FROM products WHERE estimated_available_on IS NOT NULL) AS with_date
      FROM information_schema.columns c
      WHERE c.table_name = 'products' AND c.column_name = 'estimated_available_on'`;
  }
  return { products, byStatus, fingerprint, exists, column };
}

function show(label, c, print) {
  print(`\n${label}`);
  print(`  products:  ${c.products.total} total, ${c.products.visible} visible, ${c.products.hidden} hidden`);
  print(`  status:    ${c.byStatus.map((r) => `${r.status} ${r.n}`).join(", ")}`);
  print(`  fingerprint: products ${c.fingerprint.products}, inventory ${c.fingerprint.inventory}`);
  if (!c.exists) print("  estimated_available_on: column not present");
  else
    print(
      `  estimated_available_on: ${c.column.data_type}, nullable ${c.column.is_nullable}, default ${c.column.column_default ?? "none"}, ${c.column.with_date} products with a date`
    );
}

export async function run(sql, { apply = false, log: print = console.log } = {}) {
  const before = await counts(sql);
  show("BEFORE", before, print);

  if (before.exists) {
    print("\nThe column already exists. Nothing to do.");
    return { before, after: before, applied: false };
  }

  print(
    "\nPlan: add products.estimated_available_on DATE NULL (no default) and a column comment stating its purpose." +
      `\n      All ${before.products.total} products start with no date. No other column or table is written.`
  );
  if (!apply) {
    print("\nDry run: nothing executed. Re-run with --apply.");
    return { before, after: before, applied: false };
  }

  await sql.transaction([
    sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS estimated_available_on DATE`,
    sql.query(`COMMENT ON COLUMN products.estimated_available_on IS '${COLUMN_COMMENT.replace(/'/g, "''")}'`),
  ]);

  const after = await counts(sql);
  show("AFTER", after, print);

  const problems = [];
  if (after.products.total !== before.products.total) problems.push("product count changed");
  if (after.products.visible !== before.products.visible) problems.push("visible count changed");
  if (after.fingerprint.products !== before.fingerprint.products) problems.push("product data changed");
  if (after.fingerprint.inventory !== before.fingerprint.inventory) problems.push("inventory changed");
  if (JSON.stringify(after.byStatus) !== JSON.stringify(before.byStatus)) problems.push("status counts changed");
  if (!after.column || after.column.data_type !== "date") problems.push("column is not DATE");
  if (after.column?.is_nullable !== "YES") problems.push("column is not nullable");
  if (after.column?.column_default) problems.push("column has a default");
  if (after.column?.with_date) problems.push(`${after.column.with_date} products have a date`);
  print(
    problems.length
      ? `\nCHECK FAILED: ${problems.join("; ")}`
      : "\nChecks passed: counts, statuses, product data and inventory unchanged; DATE, nullable, no default, no product has a date."
  );
  return { before, after, applied: true, problems };
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
    console.error("[estimated-availability] Failed:", err.message ?? err);
    process.exit(1);
  });
}
