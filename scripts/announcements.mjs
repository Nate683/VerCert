// Logged-in announcement banners: creates the `announcements` table and seeds the default record once.
//
//   node scripts/announcements.mjs           # dry run: prints what exists and what would be done
//   node scripts/announcements.mjs --apply   # creates the table and seeds, in one transaction
//
// Also called by `npm run db:migrate` (scripts/migrate.mjs), so fresh databases get the same schema.
//
// Safe to re-run, and safe across deploys: the table is created only if missing, and the default announcement is
// seeded only the first time — a marker row in site_content ("announcements_seeded") records that it was done, and
// the seed has a fixed id. So a later run never creates a duplicate, never overwrites edits made in /command, and
// never brings the default back after an admin deleted it.
import { pathToFileURL } from "url";

const SEED_MARKER = "announcements_seeded";
const SEED = {
  id: "member-exclusive-coming-soon",
  title: "Member Exclusive — Coming Soon",
  highlight: "VERICERT MEMBER EXCLUSIVE",
  body: "Special research collection offers coming soon. Stay tuned.",
};

async function state(sql) {
  const [{ exists }] = await sql`SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'announcements') AS exists`;
  const [{ seeded }] = await sql`SELECT EXISTS (SELECT 1 FROM site_content WHERE key = ${SEED_MARKER}) AS seeded`;
  const rows = exists ? await sql`SELECT id, title, status, enabled, starts_at, ends_at FROM announcements ORDER BY created_at` : [];
  return { exists, seeded, rows };
}

function show(label, s, print) {
  print(`\n${label}`);
  print(`  table announcements: ${s.exists ? "present" : "missing"}`);
  print(`  seed marker (site_content "${SEED_MARKER}"): ${s.seeded ? "present" : "missing"}`);
  print(`  rows: ${s.rows.length}`);
  for (const r of s.rows) print(`    - ${r.id}: "${r.title}" ${r.status}${r.enabled ? "" : " (disabled)"} ${r.starts_at ?? "—"} → ${r.ends_at ?? "—"}`);
}

export async function ensureAnnouncements(sql, { apply = false, log: print = console.log } = {}) {
  const before = await state(sql);
  show("BEFORE", before, print);

  const plan = [];
  if (!before.exists) plan.push("create table announcements");
  if (!before.seeded) plan.push(`seed "${SEED.title}" (active, starts now, no end, enabled) and record the seed marker`);
  if (plan.length === 0) { print("\nNothing to do."); return { before, after: before, applied: false }; }
  print(`\nPlan:\n  - ${plan.join("\n  - ")}`);
  if (!apply) { print("\nDry run: nothing executed. Re-run with --apply."); return { before, after: before, applied: false }; }

  const now = new Date().toISOString();
  const statements = [
    sql`
      CREATE TABLE IF NOT EXISTS announcements (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        highlight TEXT NOT NULL,
        body TEXT NOT NULL,
        link_url TEXT,
        link_label TEXT,
        status TEXT NOT NULL CHECK (status IN ('draft', 'active', 'scheduled', 'expired')),
        starts_at TEXT,
        ends_at TEXT,
        enabled BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        updated_by TEXT
      )
    `,
  ];
  if (!before.seeded) {
    statements.push(sql`
      INSERT INTO announcements (id, title, highlight, body, link_url, link_label, status, starts_at, ends_at, enabled, created_at, updated_at, updated_by)
      VALUES (${SEED.id}, ${SEED.title}, ${SEED.highlight}, ${SEED.body}, NULL, NULL, 'active', ${now}, NULL, TRUE, ${now}, ${now}, 'script:announcements')
      ON CONFLICT (id) DO NOTHING
    `);
    statements.push(sql`
      INSERT INTO site_content (key, value, updated_at) VALUES (${SEED_MARKER}, ${JSON.stringify({ seededAt: now, id: SEED.id })}, ${now})
      ON CONFLICT (key) DO NOTHING
    `);
  }
  await sql.transaction(statements);

  const after = await state(sql);
  show("AFTER", after, print);
  return { before, after, applied: true };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { config } = await import("dotenv");
  config({ path: ".env.local", quiet: true });
  const { neon } = await import("@neondatabase/serverless");
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set in .env.local.");
    process.exit(1);
  }
  ensureAnnouncements(neon(process.env.DATABASE_URL), { apply: process.argv.includes("--apply") }).catch((err) => {
    console.error("[announcements] Failed:", err.message ?? err);
    process.exit(1);
  });
}
