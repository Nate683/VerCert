// Announcement banners (logged-in and logged-out): creates the `announcements` table, adds the audience column to
// a table made before it existed, and seeds each audience's default record once.
//
//   node scripts/announcements.mjs           # dry run: prints what exists and what would be done
//   node scripts/announcements.mjs --apply   # makes the changes, in one transaction
//
// Also called by `npm run db:migrate` (scripts/migrate.mjs), so fresh databases get the same schema.
//
// Safe to re-run, and safe across deploys: the table and column are added only if missing, and each default
// announcement is seeded only the first time — a marker row in site_content records that it was done, and each
// seed has a fixed id. So a later run never creates a duplicate, never overwrites edits made in /command, and never
// brings a default back after an admin deleted it.
//
// The logged-out seed is the "Ordering opens soon" notice exactly as the site showed it from code (lib/prelaunch.ts
// before this change), with its two links written inline. It has no start time ("immediately"): code from before
// the audience column orders live records by start time with nulls last, so if this seed lands before that code is
// replaced, signed-in customers keep seeing their own announcement rather than this one.
import { pathToFileURL } from "url";

const SEEDS = [
  {
    marker: "announcements_seeded",
    id: "member-exclusive-coming-soon",
    audience: "member",
    title: "Member Exclusive — Coming Soon",
    highlight: "VERICERT MEMBER EXCLUSIVE",
    body: "Special research collection offers coming soon. Stay tuned.",
    startsNow: true,
  },
  {
    marker: "announcements_public_seeded",
    id: "ordering-opens-soon",
    audience: "public",
    title: "Ordering Opens Soon",
    highlight: "Ordering opens soon",
    body: "[Create a free account](/register) to browse the full catalog, or [join our list](/#stay-informed) to be notified when we open.",
    startsNow: false,
  },
];

async function state(sql) {
  const [{ exists }] = await sql`SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'announcements') AS exists`;
  const [{ hasAudience }] = await sql`SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'announcements' AND column_name = 'audience') AS "hasAudience"`;
  const markers = await sql`SELECT key FROM site_content WHERE key = ANY(${SEEDS.map((s) => s.marker)})`;
  const seeded = Object.fromEntries(SEEDS.map((s) => [s.marker, markers.some((m) => m.key === s.marker)]));
  const rows = exists
    ? hasAudience
      ? await sql`SELECT id, audience, title, status, enabled, starts_at, ends_at FROM announcements ORDER BY created_at`
      : await sql`SELECT id, NULL AS audience, title, status, enabled, starts_at, ends_at FROM announcements ORDER BY created_at`
    : [];
  return { exists, hasAudience, seeded, rows };
}

function show(label, s, print) {
  print(`\n${label}`);
  print(`  table announcements: ${s.exists ? "present" : "missing"}`);
  print(`  column audience: ${s.hasAudience ? "present" : "missing"}`);
  for (const seed of SEEDS) print(`  seed marker (site_content "${seed.marker}"): ${s.seeded[seed.marker] ? "present" : "missing"}`);
  print(`  rows: ${s.rows.length}`);
  for (const r of s.rows) {
    print(`    - ${r.id} [${r.audience ?? "no audience column"}]: "${r.title}" ${r.status}${r.enabled ? "" : " (disabled)"} ${r.starts_at ?? "—"} → ${r.ends_at ?? "—"}`);
  }
}

export async function ensureAnnouncements(sql, { apply = false, log: print = console.log } = {}) {
  const before = await state(sql);
  show("BEFORE", before, print);

  const toSeed = SEEDS.filter((s) => !before.seeded[s.marker]);
  const plan = [];
  if (!before.exists) plan.push("create table announcements (with the audience column)");
  else if (!before.hasAudience) plan.push("add column audience (existing rows become 'member', the logged-in audience)");
  for (const s of toSeed) {
    plan.push(`seed "${s.title}" for ${s.audience === "member" ? "logged-in customers" : "logged-out visitors"} (active, starts ${s.startsNow ? "now" : "immediately (no start time)"}, no end, enabled) and record the seed marker`);
  }
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
        updated_by TEXT,
        audience TEXT NOT NULL DEFAULT 'member' CHECK (audience IN ('member', 'public'))
      )
    `,
    sql`ALTER TABLE announcements ADD COLUMN IF NOT EXISTS audience TEXT NOT NULL DEFAULT 'member' CHECK (audience IN ('member', 'public'))`,
  ];
  for (const s of toSeed) {
    const startsAt = s.startsNow ? now : null;
    statements.push(sql`
      INSERT INTO announcements (id, audience, title, highlight, body, link_url, link_label, status, starts_at, ends_at, enabled, created_at, updated_at, updated_by)
      VALUES (${s.id}, ${s.audience}, ${s.title}, ${s.highlight}, ${s.body}, NULL, NULL, 'active', ${startsAt}, NULL, TRUE, ${now}, ${now}, 'script:announcements')
      ON CONFLICT (id) DO NOTHING
    `);
    statements.push(sql`
      INSERT INTO site_content (key, value, updated_at) VALUES (${s.marker}, ${JSON.stringify({ seededAt: now, id: s.id })}, ${now})
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
