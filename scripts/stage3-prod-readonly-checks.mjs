// READ-ONLY checks against the database in .env.local (production), authorized by the owner 2026-11-18.
// Every query runs inside ONE transaction opened READ ONLY — Postgres itself refuses any write in it.
//  1. Every inventory movement since the Stage 2 opening balances (what changed the 2,377 units), with type, change,
//     before/after, reason, note, who and when; plus per-SKU and overall totals.
//  2. The Vanguard certificate records (by laboratory name or verification link), their files, and a per-row
//     fingerprint of each, so they can be compared after any future migration.
// Run from the repo root: node <this file>
import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";
config({ path: ".env.local", quiet: true });
const sql = neon(process.env.DATABASE_URL);
console.log("database host:", new URL(process.env.DATABASE_URL).hostname);

const [opening, totals, moves, bySku, cols, labs] = await sql.transaction((tx) => [
  tx`SELECT min(created_at) AS opened_at, count(*)::int AS n, sum(resulting_quantity)::int AS units FROM inventory_movements WHERE movement_type = 'opening_balance' AND actor = 'system:migration'`,
  tx`SELECT sum(physical_quantity)::int AS units_now FROM strength_inventory`,
  tx`SELECT created_at, sku, movement_type, quantity_change::int AS change, previous_quantity::int AS before, resulting_quantity::int AS after, reason, note, actor, reference
       FROM inventory_movements WHERE movement_type <> 'opening_balance' ORDER BY created_at, id`,
  tx`SELECT sku, sum(quantity_change)::int AS net FROM inventory_movements WHERE movement_type <> 'opening_balance' GROUP BY sku HAVING sum(quantity_change) <> 0 ORDER BY sku`,
  tx`SELECT column_name FROM information_schema.columns WHERE table_name = 'coa_records'`,
  tx`SELECT id, name FROM coa_laboratories WHERE name ILIKE '%vanguard%'`,
], { readOnly: true });

console.log("\n=== 1. Inventory movements since the Stage 2 opening balances ===");
console.log(`opening balances: ${opening[0].n} strengths, ${opening[0].units} units, recorded at ${opening[0].opened_at}`);
console.log(`units now (strength_inventory): ${totals[0].units_now}  → net change ${totals[0].units_now - opening[0].units}`);
console.log(`movements after the opening (all of them, oldest first): ${moves.length}`);
for (const m of moves) {
  console.log(`  ${m.created_at} · ${m.sku} · ${m.movement_type} · ${m.change > 0 ? "+" : ""}${m.change} (${m.before} → ${m.after}) · reason: ${m.reason}${m.note ? ` · note: ${m.note}` : ""} · by ${m.actor}${m.reference ? ` · ref ${m.reference}` : ""}`);
}
console.log("net change per SKU:");
for (const r of bySku) console.log(`  ${r.sku}: ${r.net > 0 ? "+" : ""}${r.net}`);

console.log("\n=== 2. Vanguard certificate records ===");
const have = new Set(cols.map((c) => c.column_name));
const pick = ["id", "lot_number", "product_slug", "size_label", "compound_name", "laboratory_id", "laboratory_name", "lab_report_id", "verification_url",
  "approval_status", "public_visibility", "is_test", "file_id", "created_at", "updated_at", "deleted_at"].filter((c) => have.has(c));
console.log(`laboratories matching 'vanguard': ${labs.map((l) => `${l.name} (${l.id})`).join(", ") || "none"}`);
const labIds = labs.map((l) => l.id);
const [records] = await sql.transaction((tx) => [
  tx.query(`SELECT ${pick.join(", ")}, md5(to_jsonb(r)::text) AS row_fingerprint FROM coa_records r
             WHERE laboratory_name ILIKE '%vanguard%' OR verification_url ILIKE '%vanguard%' OR laboratory_id = ANY($1) ORDER BY created_at`, [labIds]),
], { readOnly: true });
console.log(`records: ${records.length}`);
for (const r of records) console.log("  " + pick.map((c) => `${c}=${r[c] ?? "—"}`).join(" · ") + ` · row_fingerprint=${r.row_fingerprint}`);
const fileIds = records.map((r) => r.file_id).filter(Boolean);
if (fileIds.length) {
  const [files] = await sql.transaction((tx) => [
    tx.query("SELECT id, file_name, content_type, size_bytes, sha256, uploaded_by, uploaded_at FROM coa_files WHERE id = ANY($1) ORDER BY uploaded_at", [fileIds]),
  ], { readOnly: true });
  console.log(`files (PDFs): ${files.length}`);
  for (const f of files) console.log(`  ${f.id} · ${f.file_name} · ${f.content_type} · ${f.size_bytes} bytes · sha256 ${f.sha256} · uploaded ${f.uploaded_at} by ${f.uploaded_by}`);
}
console.log("\nRead-only: nothing was written.");
