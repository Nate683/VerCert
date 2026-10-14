// Launch catalog follow-ups, October 14 2026.
//
//   node scripts/catalog-followups.mjs           # dry run: prints the plan
//   node scripts/catalog-followups.mjs --apply   # writes, in one transaction
//
// A1: Cagrilintide gets the Lyophilized Peptides category (it was created
// uncategorized by scripts/launch-catalog.mjs). Nothing else changes: no
// active flag, price or stock is touched.
//
// Not done here, on purpose: attaching the orphaned "semaglutide" (65) and
// "tirzepatide" (12) stock rows to GLP-1S and VC-TRZ. Both numbers are the
// illustrative seed values the app shipped with (INITIAL_INVENTORY in commit
// 9f20916) and have never been edited, so adding them would make the count
// less accurate, not more. Left for the owner to decide.
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });

import { randomUUID } from "crypto";
import { neon } from "@neondatabase/serverless";

const APPLY = process.argv.includes("--apply");
const ACTOR = "script:catalog-followups";
const CATEGORY = "Lyophilized Peptides";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not set in .env.local.");
  process.exit(1);
}
const sql = neon(connectionString);

async function main() {
  const now = new Date().toISOString();
  const statements = [];
  const [row] = await sql`SELECT slug, category, active FROM products WHERE slug = 'cagrilintide'`;
  if (!row) {
    console.log("SKIP: no cagrilintide product (run scripts/launch-catalog.mjs first).");
  } else if (row.category === CATEGORY) {
    console.log(`SKIP: cagrilintide is already "${CATEGORY}".`);
  } else {
    console.log(`cagrilintide: category ${row.category ?? "none"} → "${CATEGORY}" (stays ${row.active ? "active" : "inactive"})`);
    statements.push(sql`UPDATE products SET category = ${CATEGORY}, updated_at = ${now} WHERE slug = 'cagrilintide'`);
    statements.push(
      sql`INSERT INTO activity_log (id, actor_email, action, details, created_at) VALUES (${randomUUID()}, ${ACTOR}, 'product.updated', ${`cagrilintide: category → ${CATEGORY}`}, ${now})`
    );
  }

  if (statements.length === 0) return;
  if (!APPLY) {
    console.log(`\nDry run: ${statements.length} statements not executed. Re-run with --apply.`);
    return;
  }
  await sql.transaction(statements);
  console.log(`\nApplied ${statements.length} statements in one transaction.`);
}

main().catch((err) => {
  console.error("[catalog-followups] Failed:", err);
  process.exit(1);
});
