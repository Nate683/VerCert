// Certificate lifecycle: lot chronology, revisions, link confirmation, warning acknowledgment, soft deletion,
// inventory-review alerts. Additive only. Run against production only once the owner has approved, and BEFORE
// pushing the code that reads it.
//
//   node scripts/coa-lifecycle.mjs           # dry run: prints the current state and the plan; writes nothing
//   node scripts/coa-lifecycle.mjs --apply   # applies everything below in one transaction
//
// What it does
// - coa_records: adds NULLABLE columns with NO DEFAULT, so no existing row's values change:
//     published_at, published_by                     when/who made it public (the deliberate PUBLISH)
//     link_confirmed_url, link_confirmed_by,
//     link_confirmed_at, link_confirmed_report_id    a person opened the lab link and confirmed it shows this report
//     warnings_acknowledged (JSONB), warnings_acknowledged_by, warnings_acknowledged_at
//     deleted_at, deleted_by                         recoverable deletion (never public once set)
//     manual_fields (TEXT[])                         fields an administrator set by hand; extraction never overwrites
// - New table coa_lots: one row per VeriCert lot number with its IMMUTABLE first-upload time (chronology).
//   Backfilled from existing records: first_uploaded_at = the earliest created_at among that lot's records,
//   chronology_source = 'backfill'. Only new rows in the new table; existing tables are not written.
// - New table coa_revisions: pending corrections / edits to a published report (the published version stays public
//   until the revision is published).
// - New table coa_inventory_alerts: persistent QUALITY ALERT — REVIEW INVENTORY until acknowledged.
// Nothing is published, approved, unhidden or deleted. Test records keep is_test. Safe to re-run.
import { pathToFileURL } from "url";
import { randomUUID } from "crypto";

const NEW_RECORD_COLUMNS = [
  "published_at", "published_by", "link_confirmed_url", "link_confirmed_by", "link_confirmed_at", "link_confirmed_report_id",
  "warnings_acknowledged", "warnings_acknowledged_by", "warnings_acknowledged_at", "deleted_at", "deleted_by", "manual_fields",
];
const NEW_TABLES = ["coa_lots", "coa_revisions", "coa_inventory_alerts"];

async function state(sql) {
  const [records] = await sql`
    SELECT count(*)::int AS total,
           count(*) FILTER (WHERE is_test)::int AS test,
           count(*) FILTER (WHERE approval_status = 'approved')::int AS approved,
           count(*) FILTER (WHERE public_visibility = 'public')::int AS public,
           count(*) FILTER (WHERE approval_status = 'approved' AND public_visibility = 'public' AND NOT is_test)::int AS published
    FROM coa_records`;
  const strip = NEW_RECORD_COLUMNS.map((c) => `'${c}'`).join(" - ");
  const [fp] = await sql.query(`
    SELECT
      (SELECT md5(coalesce(string_agg((to_jsonb(r) - ${strip})::text, '|' ORDER BY id), '')) FROM coa_records r) AS records,
      (SELECT md5(coalesce(string_agg(id || ':' || sha256 || ':' || size_bytes, '|' ORDER BY id), '')) FROM coa_files) AS files,
      (SELECT md5(coalesce(string_agg(to_jsonb(a)::text, '|' ORDER BY id), '')) FROM coa_audit a) AS audit,
      (SELECT md5(coalesce(string_agg(to_jsonb(l)::text, '|' ORDER BY id), '')) FROM coa_laboratories l) AS labs,
      (SELECT md5(coalesce(string_agg(to_jsonb(c)::text, '|' ORDER BY product_slug), '')) FROM coa_acceptance_criteria c) AS criteria`);
  const cols = (await sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'coa_records'`).map((r) => r.column_name);
  const tables = (await sql`SELECT table_name FROM information_schema.tables WHERE table_name = ANY(${NEW_TABLES})`).map((r) => r.table_name);
  const lots = await sql`
    SELECT upper(lot_number) AS lot_key, min(lot_number) AS lot_number, min(created_at) AS first_uploaded_at,
           count(*)::int AS records, bool_or(is_test) AS any_test,
           count(DISTINCT coalesce(product_slug, '') || '|' || coalesce(size_label, ''))::int AS associations,
           min(product_slug) AS product_slug, min(size_label) AS size_label
    FROM coa_records WHERE lot_number IS NOT NULL GROUP BY upper(lot_number) ORDER BY 3`;
  const noLot = (await sql`SELECT count(*)::int AS n FROM coa_records WHERE lot_number IS NULL`)[0].n;
  return { records, fp, present: NEW_RECORD_COLUMNS.filter((c) => cols.includes(c)), tables, lots, noLot };
}

function show(label, s, print) {
  print(`\n${label}`);
  print(`  coa_records: ${s.records.total} total (${s.records.test} test), ${s.records.approved} approved, ${s.records.public} public, ${s.records.published} published (approved+public+not test)`);
  print(`  fingerprints: records ${s.fp.records} | files ${s.fp.files} | audit ${s.fp.audit} | labs ${s.fp.labs} | criteria ${s.fp.criteria}`);
  print(`  new coa_records columns present: ${s.present.length}/${NEW_RECORD_COLUMNS.length}${s.present.length ? " (" + s.present.join(", ") + ")" : ""}`);
  print(`  new tables present: ${s.tables.length ? s.tables.join(", ") : "none"}`);
  print(`  distinct lots in coa_records: ${s.lots.length}${s.noLot ? ` (+${s.noLot} record(s) with no lot number — no lot row; they get one when a lot is entered)` : ""}`);
  for (const l of s.lots) print(`    ${l.lot_number}: ${l.records} record(s), first uploaded ${l.first_uploaded_at}${l.any_test ? ", includes TEST data" : ""}${l.associations > 1 ? " — CONFLICTING product/strength associations: flagged for review" : ""}`);
}

export async function run(sql, { apply = false, log: print = console.log } = {}) {
  const before = await state(sql);
  show("BEFORE", before, print);
  if (before.present.length === NEW_RECORD_COLUMNS.length && before.tables.length === NEW_TABLES.length) {
    print("\nEverything already exists. Nothing to do.");
    return { before, after: before, applied: false };
  }
  print(
    `\nPlan:` +
      `\n  1. coa_records: add ${NEW_RECORD_COLUMNS.length} nullable columns, no defaults (existing rows keep every value; the new columns read NULL).` +
      `\n  2. create coa_lots, coa_revisions, coa_inventory_alerts (+ indexes, foreign keys to coa_records / coa_files).` +
      `\n  3. coa_lots backfill: ${before.lots.length} row(s), one per distinct existing lot, first_uploaded_at = earliest record created_at, source 'backfill'.` +
      `\n  Writes to existing tables: NONE. Records published/approved/unhidden: NONE.`
  );
  if (!apply) {
    print("\nDry run: nothing executed. Re-run with --apply.");
    return { before, after: before, applied: false };
  }
  const stmts = [
    ...NEW_RECORD_COLUMNS.map((c) => sql.query(`ALTER TABLE coa_records ADD COLUMN IF NOT EXISTS ${c} ${c === "warnings_acknowledged" ? "JSONB" : c === "manual_fields" ? "TEXT[]" : "TEXT"}`)),
    sql`CREATE TABLE IF NOT EXISTS coa_lots (
          id TEXT PRIMARY KEY,
          lot_key TEXT NOT NULL UNIQUE,
          lot_number TEXT NOT NULL,
          product_slug TEXT,
          size_label TEXT,
          first_uploaded_at TEXT NOT NULL,
          chronology_source TEXT NOT NULL CHECK (chronology_source IN ('upload', 'backfill')),
          needs_review BOOLEAN NOT NULL DEFAULT FALSE,
          review_note TEXT,
          created_at TEXT NOT NULL
        )`,
    sql`CREATE TABLE IF NOT EXISTS coa_revisions (
          id TEXT PRIMARY KEY,
          record_id TEXT NOT NULL REFERENCES coa_records(id),
          kind TEXT NOT NULL CHECK (kind IN ('correction', 'edit')),
          file_id TEXT REFERENCES coa_files(id),
          patch JSONB NOT NULL DEFAULT '{}',
          status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'published', 'discarded')),
          link_confirmed_url TEXT, link_confirmed_by TEXT, link_confirmed_at TEXT,
          previous JSONB,
          created_at TEXT NOT NULL, created_by TEXT NOT NULL,
          decided_at TEXT, decided_by TEXT
        )`,
    sql`CREATE UNIQUE INDEX IF NOT EXISTS coa_revisions_one_pending ON coa_revisions (record_id) WHERE status = 'pending'`,
    sql`CREATE INDEX IF NOT EXISTS coa_revisions_record ON coa_revisions (record_id, created_at)`,
    sql`CREATE TABLE IF NOT EXISTS coa_inventory_alerts (
          id TEXT PRIMARY KEY,
          record_id TEXT NOT NULL REFERENCES coa_records(id),
          product_slug TEXT, size_label TEXT, lot_number TEXT,
          reason TEXT NOT NULL,
          details JSONB,
          created_at TEXT NOT NULL, created_by TEXT NOT NULL,
          acknowledged_at TEXT, acknowledged_by TEXT, acknowledgment_note TEXT
        )`,
    sql`CREATE INDEX IF NOT EXISTS coa_inventory_alerts_open ON coa_inventory_alerts (record_id) WHERE acknowledged_at IS NULL`,
    sql`CREATE INDEX IF NOT EXISTS coa_records_published ON coa_records (product_slug, size_label) WHERE published_at IS NOT NULL AND deleted_at IS NULL`,
  ];
  const now = new Date().toISOString();
  for (const l of before.lots) {
    stmts.push(sql`INSERT INTO coa_lots (id, lot_key, lot_number, product_slug, size_label, first_uploaded_at, chronology_source, needs_review, review_note, created_at)
                   VALUES (${randomUUID()}, ${l.lot_key}, ${l.lot_number}, ${l.product_slug}, ${l.size_label}, ${l.first_uploaded_at}, 'backfill',
                           ${l.associations > 1}, ${l.associations > 1 ? "Records under this lot name different products or strengths." : null}, ${now})
                   ON CONFLICT (lot_key) DO NOTHING`);
  }
  await sql.transaction(stmts);
  const after = await state(sql);
  show("AFTER", after, print);
  const problems = [];
  for (const k of ["records", "files", "audit", "labs", "criteria"]) if (after.fp[k] !== before.fp[k]) problems.push(`${k} changed`);
  if (JSON.stringify(after.records) !== JSON.stringify(before.records)) problems.push("record counts/states changed");
  if (after.present.length !== NEW_RECORD_COLUMNS.length) problems.push("columns missing");
  if (after.tables.length !== NEW_TABLES.length) problems.push("tables missing");
  const lotRows = (await sql`SELECT count(*)::int AS n FROM coa_lots`)[0].n;
  if (lotRows !== before.lots.length) problems.push(`coa_lots has ${lotRows} rows, expected ${before.lots.length}`);
  const nonNull = (await sql.query(`SELECT count(*)::int AS n FROM coa_records WHERE ${NEW_RECORD_COLUMNS.map((c) => `${c} IS NOT NULL`).join(" OR ")}`))[0].n;
  if (nonNull) problems.push(`${nonNull} records have a value in a new column`);
  print(problems.length ? `\nCHECK FAILED: ${problems.join("; ")}` : `\nChecks passed: existing records, files, audit, labs and criteria unchanged; states unchanged; ${lotRows} lot row(s) backfilled; new columns all NULL.`);
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
    console.error("[coa-lifecycle] Failed:", err.message ?? err);
    process.exit(1);
  });
}
