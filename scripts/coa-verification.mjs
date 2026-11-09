// COA verification system: creates its tables. Additive only — no existing table or row is changed.
//
//   node scripts/coa-verification.mjs           # dry run: prints what exists and what would be created
//   node scripts/coa-verification.mjs --apply   # creates the missing tables and the default acceptance criteria
//
// Also called by `npm run db:migrate` (scripts/migrate.mjs).
//
// Tables:
//   coa_laboratories        testing laboratories and the web hosts their verification records live on
//   coa_files               original certificate PDFs, byte-for-byte (base64), with their SHA-256
//   coa_records             one laboratory certificate tied to one VeriCert lot of one product size
//   coa_audit               every extraction, edit, approval, rejection, publication and deletion, with the actor
//   coa_acceptance_criteria release specifications ('*' = the default; a product slug overrides it)
//
// Why PDFs live in Postgres rather than the Blob store: the existing Blob store is public-access, so anything put
// there has a public URL — including certificates still in review or rejected. Here a PDF can only be read through
// the site, which serves it only for approved, published records (and to authorized admins).
//
// Safe to re-run: every statement is CREATE … IF NOT EXISTS / INSERT … ON CONFLICT DO NOTHING. Nothing is ever
// deleted or overwritten, and no record is created except the one default criteria row (which an admin can edit).
import { pathToFileURL } from "url";

const TABLES = ["coa_laboratories", "coa_files", "coa_records", "coa_audit", "coa_acceptance_criteria"];

async function state(sql) {
  const rows = await sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ANY(${TABLES})`;
  const present = new Set(rows.map((r) => r.table_name));
  const counts = {};
  for (const t of TABLES) if (present.has(t)) counts[t] = (await sql.query(`SELECT count(*)::int AS n FROM ${t}`))[0].n;
  return { present, counts };
}

function show(label, s, print) {
  print(`\n${label}`);
  for (const t of TABLES) print(`  ${t}: ${s.present.has(t) ? `present (${s.counts[t]} rows)` : "missing"}`);
}

export async function ensureCoaVerification(sql, { apply = false, log: print = console.log } = {}) {
  const before = await state(sql);
  show("BEFORE", before, print);
  const missing = TABLES.filter((t) => !before.present.has(t));
  const needsCriteria = !before.present.has("coa_acceptance_criteria") || before.counts.coa_acceptance_criteria === 0;
  if (missing.length === 0 && !needsCriteria) { print("\nNothing to do."); return { applied: false }; }
  print(`\nPlan:\n${missing.map((t) => `  - create table ${t}`).join("\n")}${needsCriteria ? "\n  - add the default acceptance criteria ('*': purity ≥ 99.0%, quantity 100–120% of label)" : ""}`);
  if (!apply) { print("\nDry run: nothing executed. Re-run with --apply."); return { applied: false }; }

  const now = new Date().toISOString();
  await sql.transaction([
    sql`
      CREATE TABLE IF NOT EXISTS coa_laboratories (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        verification_hosts TEXT[] NOT NULL DEFAULT '{}',
        accreditation_note TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        updated_by TEXT
      )
    `,
    sql`
      CREATE TABLE IF NOT EXISTS coa_files (
        id TEXT PRIMARY KEY,
        sha256 TEXT NOT NULL UNIQUE,
        file_name TEXT NOT NULL,
        content_type TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        page_count INTEGER,
        data_base64 TEXT NOT NULL,
        text_layer TEXT,
        uploaded_by TEXT NOT NULL,
        uploaded_at TEXT NOT NULL
      )
    `,
    sql`
      CREATE TABLE IF NOT EXISTS coa_records (
        id TEXT PRIMARY KEY,
        lot_number TEXT,
        product_slug TEXT,
        compound_name TEXT,
        size_label TEXT,
        sku TEXT,
        inventory_lot TEXT,
        laboratory_id TEXT REFERENCES coa_laboratories(id),
        laboratory_name TEXT,
        lab_report_id TEXT,
        tested_on TEXT,
        issued_on TEXT,
        purity_result TEXT,
        purity_percent NUMERIC,
        quantity_result TEXT,
        quantity_mg NUMERIC,
        appearance TEXT,
        test_results JSONB NOT NULL DEFAULT '[]',
        file_id TEXT REFERENCES coa_files(id),
        verification_url TEXT,
        verification_status TEXT NOT NULL DEFAULT 'none'
          CHECK (verification_status IN ('none', 'unchecked', 'valid', 'invalid')),
        verification_note TEXT,
        verification_checked_at TEXT,
        extraction JSONB,
        review_status TEXT NOT NULL DEFAULT 'needs_review'
          CHECK (review_status IN ('needs_review', 'reviewed')),
        approval_status TEXT NOT NULL DEFAULT 'pending'
          CHECK (approval_status IN ('pending', 'approved', 'rejected')),
        rejection_reason TEXT,
        public_visibility TEXT NOT NULL DEFAULT 'hidden'
          CHECK (public_visibility IN ('hidden', 'public')),
        inventory_status TEXT NOT NULL DEFAULT 'auto'
          CHECK (inventory_status IN ('auto', 'available', 'unavailable')),
        historical BOOLEAN NOT NULL DEFAULT FALSE,
        disposition_on TEXT,
        is_test BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TEXT NOT NULL,
        created_by TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        updated_by TEXT NOT NULL,
        approved_at TEXT,
        approved_by TEXT,
        -- Publication requires approval; a rejected record can never be public.
        CHECK (public_visibility = 'hidden' OR approval_status = 'approved')
      )
    `,
    // A lot can carry more than one certificate (a retest), but never the same laboratory report twice.
    sql`CREATE UNIQUE INDEX IF NOT EXISTS coa_records_lot_report ON coa_records (upper(lot_number), coalesce(upper(lab_report_id), '')) WHERE lot_number IS NOT NULL`,
    sql`CREATE UNIQUE INDEX IF NOT EXISTS coa_records_file ON coa_records (file_id) WHERE file_id IS NOT NULL`,
    sql`CREATE INDEX IF NOT EXISTS coa_records_public ON coa_records (approval_status, public_visibility, is_test)`,
    sql`
      CREATE TABLE IF NOT EXISTS coa_audit (
        id TEXT PRIMARY KEY,
        record_id TEXT,
        action TEXT NOT NULL,
        actor TEXT NOT NULL,
        at TEXT NOT NULL,
        details JSONB
      )
    `,
    sql`CREATE INDEX IF NOT EXISTS coa_audit_record ON coa_audit (record_id, at)`,
    sql`
      CREATE TABLE IF NOT EXISTS coa_acceptance_criteria (
        product_slug TEXT PRIMARY KEY,
        applies BOOLEAN NOT NULL DEFAULT TRUE,
        min_purity_percent NUMERIC,
        quantity_min_percent NUMERIC,
        quantity_max_percent NUMERIC,
        required_tests TEXT[] NOT NULL DEFAULT '{}',
        updated_at TEXT NOT NULL,
        updated_by TEXT NOT NULL
      )
    `,
    sql`
      INSERT INTO coa_acceptance_criteria (product_slug, applies, min_purity_percent, quantity_min_percent, quantity_max_percent, required_tests, updated_at, updated_by)
      VALUES ('*', TRUE, 99.0, 100, 120, '{}', ${now}, 'script:coa-verification')
      ON CONFLICT (product_slug) DO NOTHING
    `,
  ]);

  const after = await state(sql);
  show("AFTER", after, print);
  return { applied: true };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { config } = await import("dotenv");
  config({ path: ".env.local", quiet: true });
  const { neon } = await import("@neondatabase/serverless");
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set in .env.local.");
    process.exit(1);
  }
  ensureCoaVerification(neon(process.env.DATABASE_URL), { apply: process.argv.includes("--apply") }).catch((err) => {
    console.error("[coa-verification] Failed:", err.message ?? err);
    process.exit(1);
  });
}
