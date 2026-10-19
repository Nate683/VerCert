// Contact details, October 2026: the public email becomes
// info@vericertpeptides.com and the hours are Central time. The values live in
// the site_content "contact_page" row (edited in EXEC MODE), which overrides the
// defaults in lib/site-content/defaults.ts, so the row is updated here.
//
//   node scripts/contact-details.mjs           # dry run: prints the plan
//   node scripts/contact-details.mjs --apply   # writes, in one transaction
//
// Any other support@ address found in site_content is reported, not changed.
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });

import { randomUUID } from "crypto";
import { neon } from "@neondatabase/serverless";

const APPLY = process.argv.includes("--apply");
const ACTOR = "script:contact-details";
const EMAIL = "info@vericertpeptides.com";
const HOURS = "Monday – Friday, 9am – 5pm CT";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not set in .env.local.");
  process.exit(1);
}
const sql = neon(connectionString);

async function main() {
  const now = new Date().toISOString();
  const statements = [];

  const rows = await sql`SELECT key, value FROM site_content`;
  for (const row of rows) {
    if (row.key !== "contact_page" && /support@/i.test(row.value)) {
      console.log(`NOTE: "${row.key}" mentions a support@ address; not changed.`);
    }
  }

  const contact = rows.find((r) => r.key === "contact_page");
  if (!contact) {
    console.log("No contact_page row: the code defaults already carry the new email and hours.");
    return;
  }
  const value = JSON.parse(contact.value);
  const changes = [];
  if (value.email !== EMAIL) changes.push(`email ${value.email} → ${EMAIL}`);
  if (value.hours !== HOURS) changes.push(`hours "${value.hours}" → "${HOURS}"`);
  if (changes.length === 0) {
    console.log("SKIP: contact_page already up to date.");
    return;
  }
  const next = JSON.stringify({ ...value, email: EMAIL, hours: HOURS });
  console.log(`contact_page: ${changes.join("; ")}`);
  statements.push(sql`UPDATE site_content SET value = ${next}, updated_at = ${now} WHERE key = 'contact_page'`);
  statements.push(
    sql`INSERT INTO activity_log (id, actor_email, action, details, created_at) VALUES (${randomUUID()}, ${ACTOR}, 'content.updated', ${`contact_page: ${changes.join("; ")}`}, ${now})`
  );

  if (!APPLY) {
    console.log(`\nDry run: ${statements.length} statements not executed. Re-run with --apply.`);
    return;
  }
  await sql.transaction(statements);
  console.log(`\nApplied ${statements.length} statements in one transaction.`);
}

main().catch((err) => {
  console.error("[contact-details] Failed:", err);
  process.exit(1);
});
