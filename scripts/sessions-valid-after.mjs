// Adds users.sessions_valid_after: the instant (ISO text, like the table's
// other timestamps) before which an account's sessions no longer count. Set
// by Account Settings → Change Password so other browsers are signed out.
// Run against production only once the owner has approved, and BEFORE pushing
// the code that reads the column.
//
//   node scripts/sessions-valid-after.mjs           # dry run: prints the counts and the plan
//   node scripts/sessions-valid-after.mjs --apply   # adds the column, in one transaction
//
// TEXT, nullable, no default: every account starts with no cut-off, so no one
// is signed out by the migration itself. Nothing else is written; the script
// checks that with a fingerprint of every other users column.
// Safe to re-run: once the column exists, nothing is written.
import { pathToFileURL } from "url";

const COLUMN_COMMENT =
  "Sessions signed in before this instant are no longer accepted. Set when the password is changed. Null = no cut-off.";

async function counts(sql) {
  const [users] = await sql`
    SELECT count(*)::int AS total, count(*) FILTER (WHERE role IS NOT NULL)::int AS staff FROM users`;
  const [fingerprint] = await sql`
    SELECT md5(coalesce(string_agg((to_jsonb(u) - 'sessions_valid_after')::text, '|' ORDER BY id), '')) AS users
    FROM users u`;
  const [{ exists }] = await sql`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'sessions_valid_after'
    ) AS exists`;
  let column = null;
  if (exists) {
    [column] = await sql`
      SELECT c.data_type, c.is_nullable, c.column_default,
             (SELECT count(*)::int FROM users WHERE sessions_valid_after IS NOT NULL) AS with_value
      FROM information_schema.columns c
      WHERE c.table_name = 'users' AND c.column_name = 'sessions_valid_after'`;
  }
  return { users, fingerprint, exists, column };
}

function show(label, c, print) {
  print(`\n${label}`);
  print(`  users: ${c.users.total} total, ${c.users.staff} staff`);
  print(`  fingerprint: users ${c.fingerprint.users}`);
  if (!c.exists) print("  sessions_valid_after: column not present");
  else print(`  sessions_valid_after: ${c.column.data_type}, nullable ${c.column.is_nullable}, default ${c.column.column_default ?? "none"}, ${c.column.with_value} accounts with a value`);
}

export async function run(sql, { apply = false, log: print = console.log } = {}) {
  const before = await counts(sql);
  show("BEFORE", before, print);
  if (before.exists) {
    print("\nThe column already exists. Nothing to do.");
    return { before, after: before, applied: false };
  }
  print(
    "\nPlan: add users.sessions_valid_after TEXT NULL (no default) and a column comment." +
      `\n      All ${before.users.total} accounts start with no cut-off; no one is signed out. No other column or table is written.`
  );
  if (!apply) {
    print("\nDry run: nothing executed. Re-run with --apply.");
    return { before, after: before, applied: false };
  }
  await sql.transaction([
    sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS sessions_valid_after TEXT`,
    sql.query(`COMMENT ON COLUMN users.sessions_valid_after IS '${COLUMN_COMMENT.replace(/'/g, "''")}'`),
  ]);
  const after = await counts(sql);
  show("AFTER", after, print);
  const problems = [];
  if (after.users.total !== before.users.total) problems.push("user count changed");
  if (after.fingerprint.users !== before.fingerprint.users) problems.push("user data changed");
  if (!after.column || after.column.data_type !== "text") problems.push("column is not TEXT");
  if (after.column?.is_nullable !== "YES") problems.push("column is not nullable");
  if (after.column?.column_default) problems.push("column has a default");
  if (after.column?.with_value) problems.push(`${after.column.with_value} accounts have a value`);
  print(problems.length ? `\nCHECK FAILED: ${problems.join("; ")}` : "\nChecks passed: user count and data unchanged; TEXT, nullable, no default, no account has a value.");
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
    console.error("[sessions-valid-after] Failed:", err.message ?? err);
    process.exit(1);
  });
}
