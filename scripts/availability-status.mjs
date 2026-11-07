// Adds products.availability_status (Coming Soon / Pending Independent
// Testing / In Stock / Out of Stock). Run it against production only once the
// owner has approved, and BEFORE pushing the code that reads the column.
//
//   node scripts/availability-status.mjs           # dry run: prints the counts and the plan
//   node scripts/availability-status.mjs --apply   # adds the column, in one transaction
//
// Decided with the owner on 2026-11-07:
// - Every product starts at Coming Soon, visible and hidden alike. Nothing is
//   set to In Stock because its inventory is positive.
// - Visibility (products.active) is not touched; neither is any other column
//   or the inventory table. The script checks that afterwards with a
//   fingerprint of every other product column and every inventory row.
//
// Safe to re-run: once the column exists, nothing is written.
import { pathToFileURL } from "url";

const STATUSES = ["coming_soon", "pending_testing", "in_stock", "out_of_stock"];

async function counts(sql) {
  const [products] = await sql`
    SELECT count(*)::int AS total,
           count(*) FILTER (WHERE active)::int AS visible,
           count(*) FILTER (WHERE NOT active)::int AS hidden
    FROM products`;
  const [inventory] = await sql`
    SELECT count(*)::int AS rows, coalesce(sum(quantity), 0)::int AS units,
           count(*) FILTER (WHERE quantity > 0)::int AS positive
    FROM inventory`;
  // Everything except the new column, so the before and after values compare.
  const [fingerprint] = await sql`
    SELECT
      (SELECT md5(coalesce(string_agg((to_jsonb(p) - 'availability_status')::text, '|' ORDER BY slug), ''))
         FROM products p) AS products,
      (SELECT md5(coalesce(string_agg(to_jsonb(i)::text, '|' ORDER BY slug, size_label), ''))
         FROM inventory i) AS inventory`;
  const [{ exists }] = await sql`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'products' AND column_name = 'availability_status'
    ) AS exists`;
  let byStatus = null;
  if (exists) {
    byStatus = await sql`
      SELECT availability_status AS status, active, count(*)::int AS n
      FROM products GROUP BY 1, 2 ORDER BY 1, 2 DESC`;
  }
  return { products, inventory, fingerprint, exists, byStatus };
}

function show(label, c, print) {
  print(`\n${label}`);
  print(`  products:  ${c.products.total} total, ${c.products.visible} visible, ${c.products.hidden} hidden`);
  print(`  inventory: ${c.inventory.rows} rows, ${c.inventory.positive} above zero, ${c.inventory.units} units`);
  print(`  fingerprint: products ${c.fingerprint.products}, inventory ${c.fingerprint.inventory}`);
  if (!c.exists) print("  availability_status: column not present");
  else for (const r of c.byStatus) print(`  availability_status ${r.status} / ${r.active ? "visible" : "hidden"}: ${r.n}`);
}

export async function run(sql, { apply = false, log: print = console.log } = {}) {
  const before = await counts(sql);
  show("BEFORE", before, print);

  if (before.exists) {
    print("\nThe column already exists. Nothing to do.");
    return { before, after: before, applied: false };
  }

  print(
    `\nPlan: add products.availability_status TEXT NOT NULL DEFAULT 'coming_soon' with a check on ${STATUSES.join(", ")}.` +
      `\n      All ${before.products.total} products become coming_soon. No other column or table is written.`
  );
  if (!apply) {
    print("\nDry run: nothing executed. Re-run with --apply.");
    return { before, after: before, applied: false };
  }

  await sql.transaction([
    sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS availability_status TEXT NOT NULL DEFAULT 'coming_soon'`,
    sql`ALTER TABLE products ADD CONSTRAINT products_availability_status_check
          CHECK (availability_status IN ('coming_soon', 'pending_testing', 'in_stock', 'out_of_stock'))`,
  ]);

  const after = await counts(sql);
  show("AFTER", after, print);

  const problems = [];
  if (after.products.total !== before.products.total) problems.push("product count changed");
  if (after.products.visible !== before.products.visible) problems.push("visible count changed");
  if (after.fingerprint.products !== before.fingerprint.products) problems.push("product data changed");
  if (after.fingerprint.inventory !== before.fingerprint.inventory) problems.push("inventory changed");
  const notComingSoon = after.byStatus.filter((r) => r.status !== "coming_soon").reduce((n, r) => n + r.n, 0);
  if (notComingSoon > 0) problems.push(`${notComingSoon} products not coming_soon`);
  print(problems.length ? `\nCHECK FAILED: ${problems.join("; ")}` : "\nChecks passed: counts, product data and inventory unchanged; every product is coming_soon.");
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
    console.error("[availability-status] Failed:", err.message ?? err);
    process.exit(1);
  });
}
