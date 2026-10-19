// Launch catalog follow-ups, October 14 2026.
//
//   node scripts/catalog-followups.mjs           # dry run: prints the plan
//   node scripts/catalog-followups.mjs --apply   # writes, in one transaction
//
// A1: Cagrilintide, GLP3-RT, VC-TRZ and GLP-1S get the Lyophilized Peptides
// category (they were created uncategorized). A3: Retatrutide is retired.
// Nothing else changes: no other active flag, and no price or stock, is
// touched.
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
// Cagrilintide (A1, October 14) and the three launch codes GLP3-RT, VC-TRZ
// and GLP-1S (owner, October 19), all created uncategorized.
const CATEGORIZE = ["cagrilintide", "vc3r", "vc2t", "vc1s"];

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not set in .env.local.");
  process.exit(1);
}
const sql = neon(connectionString);

async function main() {
  const now = new Date().toISOString();
  const statements = [];
  for (const slug of CATEGORIZE) {
    const [row] = await sql`SELECT slug, category, active FROM products WHERE slug = ${slug}`;
    if (!row) {
      console.log(`SKIP: no ${slug} product (run scripts/launch-catalog.mjs first).`);
    } else if (row.category === CATEGORY) {
      console.log(`SKIP: ${slug} is already "${CATEGORY}".`);
    } else {
      console.log(`${slug}: category ${row.category ?? "none"} → "${CATEGORY}" (stays ${row.active ? "active" : "inactive"})`);
      statements.push(sql`UPDATE products SET category = ${CATEGORY}, updated_at = ${now} WHERE slug = ${slug}`);
      statements.push(
        sql`INSERT INTO activity_log (id, actor_email, action, details, created_at) VALUES (${randomUUID()}, ${ACTOR}, 'product.updated', ${`${slug}: category → ${CATEGORY}`}, ${now})`
      );
    }
  }

  // A3: Retatrutide is retired (set inactive), as the owner decided on
  // 2026-10-17. GLP3-RT (vc3r) is the launch product; it is not touched, and
  // Retatrutide's CAS and category are not copied onto it.
  const [reta] = await sql`SELECT slug, active FROM products WHERE slug = 'retatrutide'`;
  if (!reta) {
    console.log("SKIP: no retatrutide product.");
  } else if (!reta.active) {
    console.log("SKIP: retatrutide is already inactive.");
  } else {
    console.log("retatrutide: retired → inactive");
    statements.push(sql`UPDATE products SET active = FALSE, updated_at = ${now} WHERE slug = 'retatrutide'`);
    statements.push(
      sql`INSERT INTO activity_log (id, actor_email, action, details, created_at) VALUES (${randomUUID()}, ${ACTOR}, 'product.updated', 'retatrutide: retired (set inactive) — GLP3-RT is the launch product', ${now})`
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
