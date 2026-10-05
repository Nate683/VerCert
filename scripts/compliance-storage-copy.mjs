// Removes post-reconstitution handling from product storage text, October
// 2026. "Store lyophilized at -20 °C, protected from light. After
// reconstitution, …" keeps only its first sentence: everything from "After
// reconstitution" to the end goes.
//
//   node scripts/compliance-storage-copy.mjs           # dry run: prints the plan
//   node scripts/compliance-storage-copy.mjs --apply   # writes, in one transaction
//
// Safe to re-run: products without the phrase are left alone. Also reports any
// site_content row still containing "discreet" (none expected; nothing there is
// rewritten automatically).
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });

import { randomUUID } from "crypto";
import { neon } from "@neondatabase/serverless";

const APPLY = process.argv.includes("--apply");
const ACTOR = "script:compliance-storage-copy";
const CUT = /\s*After reconstitution\b[\s\S]*$/i;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not set in .env.local.");
  process.exit(1);
}
const sql = neon(connectionString);

async function main() {
  const now = new Date().toISOString();
  const statements = [];
  const plan = [];

  const products = await sql`SELECT slug, storage FROM products ORDER BY slug`;
  for (const p of products) {
    if (!p.storage || !CUT.test(p.storage)) continue;
    const storage = p.storage.replace(CUT, "").trim();
    plan.push(`${p.slug}: "${storage}"`);
    statements.push(sql`UPDATE products SET storage = ${storage}, updated_at = ${now} WHERE slug = ${p.slug}`);
    statements.push(
      sql`INSERT INTO activity_log (id, actor_email, action, details, created_at) VALUES (${randomUUID()}, ${ACTOR}, ${"product.updated"}, ${`${p.slug}: storage text trimmed to the lyophilized line`}, ${now})`
    );
  }

  const content = await sql`SELECT key FROM site_content WHERE value ILIKE ${"%discreet%"}`;
  for (const row of content) plan.push(`NOTE site_content "${row.key}" still contains "discreet" — edit it in /command.`);

  console.log(plan.length ? plan.join("\n") : "Nothing to change.");
  if (!APPLY) {
    console.log(`\nDry run: ${statements.length} statements not executed. Re-run with --apply.`);
    return;
  }
  if (statements.length) await sql.transaction(statements);
  console.log(`\nApplied ${statements.length} statements in one transaction.`);
}

main().catch((err) => {
  console.error("[compliance-storage-copy] Failed:", err);
  process.exit(1);
});
