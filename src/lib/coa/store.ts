import { createHash, randomUUID } from "crypto";
import { query } from "@/lib/db";
import type {
  AcceptanceCriteria,
  ApprovalStatus,
  CoaRecord,
  ExtractionReport,
  InventoryStatus,
  Laboratory,
  ReviewStatus,
  TestResult,
  VerificationStatus,
  Visibility,
} from "./types";

// Server-only Postgres store for the COA verification system (tables: scripts/coa-verification.mjs).
// Every change goes through here and writes an audit entry with the acting account.

type RecordRow = {
  id: string;
  lot_number: string;
  product_slug: string | null;
  compound_name: string | null;
  size_label: string | null;
  sku: string | null;
  inventory_lot: string | null;
  laboratory_id: string | null;
  laboratory_name: string | null;
  lab_report_id: string | null;
  tested_on: string | null;
  issued_on: string | null;
  purity_result: string | null;
  purity_percent: string | number | null;
  quantity_result: string | null;
  quantity_mg: string | number | null;
  appearance: string | null;
  test_results: TestResult[] | string | null;
  file_id: string | null;
  verification_url: string | null;
  verification_status: VerificationStatus;
  verification_note: string | null;
  verification_checked_at: string | null;
  extraction: ExtractionReport | string | null;
  review_status: ReviewStatus;
  approval_status: ApprovalStatus;
  rejection_reason: string | null;
  public_visibility: Visibility;
  inventory_status: InventoryStatus;
  historical: boolean;
  disposition_on: string | null;
  is_test: boolean;
  created_at: string;
  created_by: string;
  updated_at: string;
  updated_by: string;
  approved_at: string | null;
  approved_by: string | null;
};

const json = <T>(v: T | string | null, fallback: T): T => (v === null ? fallback : typeof v === "string" ? (JSON.parse(v) as T) : v);
const num = (v: string | number | null): number | null => (v === null || v === "" ? null : Number(v));

function toRecord(r: RecordRow): CoaRecord {
  return {
    id: r.id,
    lotNumber: r.lot_number,
    productSlug: r.product_slug,
    compoundName: r.compound_name,
    sizeLabel: r.size_label,
    sku: r.sku,
    inventoryLot: r.inventory_lot,
    laboratoryId: r.laboratory_id,
    laboratoryName: r.laboratory_name,
    labReportId: r.lab_report_id,
    testedOn: r.tested_on,
    issuedOn: r.issued_on,
    purityResult: r.purity_result,
    purityPercent: num(r.purity_percent),
    quantityResult: r.quantity_result,
    quantityMg: num(r.quantity_mg),
    appearance: r.appearance,
    testResults: json<TestResult[]>(r.test_results, []),
    fileId: r.file_id,
    verificationUrl: r.verification_url,
    verificationStatus: r.verification_status,
    verificationNote: r.verification_note,
    verificationCheckedAt: r.verification_checked_at,
    extraction: json<ExtractionReport | null>(r.extraction, null),
    reviewStatus: r.review_status,
    approvalStatus: r.approval_status,
    rejectionReason: r.rejection_reason,
    publicVisibility: r.public_visibility,
    inventoryStatus: r.inventory_status,
    historical: r.historical,
    dispositionOn: r.disposition_on,
    isTest: r.is_test,
    createdAt: r.created_at,
    createdBy: r.created_by,
    updatedAt: r.updated_at,
    updatedBy: r.updated_by,
    approvedAt: r.approved_at,
    approvedBy: r.approved_by,
  };
}

// Column for each editable record field.
const COLUMNS: Record<string, string> = {
  lotNumber: "lot_number",
  productSlug: "product_slug",
  compoundName: "compound_name",
  sizeLabel: "size_label",
  sku: "sku",
  inventoryLot: "inventory_lot",
  laboratoryId: "laboratory_id",
  laboratoryName: "laboratory_name",
  labReportId: "lab_report_id",
  testedOn: "tested_on",
  issuedOn: "issued_on",
  purityResult: "purity_result",
  purityPercent: "purity_percent",
  quantityResult: "quantity_result",
  quantityMg: "quantity_mg",
  appearance: "appearance",
  testResults: "test_results",
  verificationUrl: "verification_url",
  verificationStatus: "verification_status",
  verificationNote: "verification_note",
  verificationCheckedAt: "verification_checked_at",
  extraction: "extraction",
  reviewStatus: "review_status",
  approvalStatus: "approval_status",
  rejectionReason: "rejection_reason",
  publicVisibility: "public_visibility",
  inventoryStatus: "inventory_status",
  historical: "historical",
  dispositionOn: "disposition_on",
  approvedAt: "approved_at",
  approvedBy: "approved_by",
};
const JSON_FIELDS = new Set(["testResults", "extraction"]);

export type RecordPatch = Partial<Omit<CoaRecord, "id" | "fileId" | "isTest" | "createdAt" | "createdBy" | "updatedAt" | "updatedBy">>;

// --- Records -------------------------------------------------------------------------------------------------------

export async function listRecords(): Promise<CoaRecord[]> {
  const rows = await query<RecordRow>("SELECT * FROM coa_records ORDER BY updated_at DESC, id");
  return rows.map(toRecord);
}

export async function getRecord(id: string): Promise<CoaRecord | null> {
  const rows = await query<RecordRow>("SELECT * FROM coa_records WHERE id = $1", [id]);
  return rows[0] ? toRecord(rows[0]) : null;
}

// Records the public may see: approved AND published, never test data. The test-data exception exists only for a
// local `next dev` session with COA_INCLUDE_TEST_RECORDS=1 (lib/coa/public.ts decides); it can't apply in a
// production build.
export async function listPublishedRecords(includeTest: boolean): Promise<CoaRecord[]> {
  const rows = await query<RecordRow>(
    `SELECT * FROM coa_records
      WHERE approval_status = 'approved' AND public_visibility = 'public'
        ${includeTest ? "" : "AND is_test = FALSE"}
      ORDER BY issued_on DESC NULLS LAST, lot_number`
  );
  return rows.map(toRecord);
}

export async function createRecord(
  input: { lotNumber: string | null; fileId: string; isTest: boolean; extraction: ExtractionReport | null } & RecordPatch,
  actor: string
): Promise<CoaRecord> {
  const id = randomUUID();
  const now = new Date().toISOString();
  await query(
    `INSERT INTO coa_records (id, lot_number, file_id, is_test, created_at, created_by, updated_at, updated_by)
     VALUES ($1, $2, $3, $4, $5, $6, $5, $6)`,
    [id, input.lotNumber, input.fileId, input.isTest, now, actor]
  );
  const { lotNumber: _l, fileId: _f, isTest: _t, ...rest } = input;
  void _l; void _f; void _t;
  if (Object.keys(rest).length) await updateRecord(id, rest, actor);
  return (await getRecord(id))!;
}

export async function updateRecord(id: string, patch: RecordPatch, actor: string): Promise<CoaRecord | null> {
  const sets: string[] = [];
  const params: unknown[] = [id];
  for (const [key, value] of Object.entries(patch)) {
    const col = COLUMNS[key];
    if (!col || value === undefined) continue;
    params.push(JSON_FIELDS.has(key) && value !== null ? JSON.stringify(value) : value);
    sets.push(`${col} = $${params.length}${JSON_FIELDS.has(key) ? "::jsonb" : ""}`);
  }
  params.push(new Date().toISOString(), actor);
  sets.push(`updated_at = $${params.length - 1}`, `updated_by = $${params.length}`);
  await query(`UPDATE coa_records SET ${sets.join(", ")} WHERE id = $1`, params);
  return getRecord(id);
}

export async function deleteRecord(id: string): Promise<void> {
  const rows = await query<{ file_id: string | null }>("DELETE FROM coa_records WHERE id = $1 RETURNING file_id", [id]);
  const fileId = rows[0]?.file_id;
  if (fileId) await query("DELETE FROM coa_files WHERE id = $1 AND NOT EXISTS (SELECT 1 FROM coa_records WHERE file_id = $1)", [fileId]);
}

// --- Files ---------------------------------------------------------------------------------------------------------

export type StoredFile = { id: string; sha256: string; fileName: string; contentType: string; sizeBytes: number; pageCount: number | null; textLayer: string | null };

export function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export async function findFileBySha(sha: string): Promise<{ id: string; recordId: string | null } | null> {
  const rows = await query<{ id: string; record_id: string | null }>(
    "SELECT f.id, r.id AS record_id FROM coa_files f LEFT JOIN coa_records r ON r.file_id = f.id WHERE f.sha256 = $1",
    [sha]
  );
  return rows[0] ? { id: rows[0].id, recordId: rows[0].record_id } : null;
}

// Stores the uploaded bytes exactly as received.
export async function storeFile(
  bytes: Uint8Array,
  meta: { fileName: string; pageCount: number | null; textLayer: string | null },
  actor: string
): Promise<StoredFile> {
  const id = randomUUID();
  const hash = sha256(bytes);
  await query(
    `INSERT INTO coa_files (id, sha256, file_name, content_type, size_bytes, page_count, data_base64, text_layer, uploaded_by, uploaded_at)
     VALUES ($1, $2, $3, 'application/pdf', $4, $5, $6, $7, $8, $9)`,
    [id, hash, meta.fileName, bytes.byteLength, meta.pageCount, Buffer.from(bytes).toString("base64"), meta.textLayer, actor, new Date().toISOString()]
  );
  return { id, sha256: hash, fileName: meta.fileName, contentType: "application/pdf", sizeBytes: bytes.byteLength, pageCount: meta.pageCount, textLayer: meta.textLayer };
}

// The original bytes, checked against the hash taken at upload; a mismatch is an error, never served.
export async function readFile(id: string): Promise<{ bytes: Buffer; fileName: string; sha256: string } | null> {
  const rows = await query<{ data_base64: string; file_name: string; sha256: string }>(
    "SELECT data_base64, file_name, sha256 FROM coa_files WHERE id = $1",
    [id]
  );
  if (!rows[0]) return null;
  const bytes = Buffer.from(rows[0].data_base64, "base64");
  if (sha256(bytes) !== rows[0].sha256) throw new Error(`COA file ${id} failed its integrity check.`);
  return { bytes, fileName: rows[0].file_name, sha256: rows[0].sha256 };
}

export async function getFileMeta(id: string): Promise<StoredFile | null> {
  const rows = await query<{ id: string; sha256: string; file_name: string; content_type: string; size_bytes: number; page_count: number | null; text_layer: string | null }>(
    "SELECT id, sha256, file_name, content_type, size_bytes, page_count, text_layer FROM coa_files WHERE id = $1",
    [id]
  );
  const r = rows[0];
  return r ? { id: r.id, sha256: r.sha256, fileName: r.file_name, contentType: r.content_type, sizeBytes: Number(r.size_bytes), pageCount: r.page_count, textLayer: r.text_layer } : null;
}

// --- Laboratories --------------------------------------------------------------------------------------------------

type LabRow = { id: string; name: string; verification_hosts: string[] | string; accreditation_note: string | null };
const parseArray = (v: string[] | string): string[] =>
  Array.isArray(v) ? v : v.replace(/^\{|\}$/g, "").split(",").map((s) => s.replace(/^"|"$/g, "")).filter(Boolean);

export async function listLabs(): Promise<Laboratory[]> {
  const rows = await query<LabRow>("SELECT id, name, verification_hosts, accreditation_note FROM coa_laboratories ORDER BY name");
  return rows.map((r) => ({ id: r.id, name: r.name, verificationHosts: parseArray(r.verification_hosts), accreditationNote: r.accreditation_note }));
}

export async function saveLab(lab: { id?: string; name: string; verificationHosts: string[]; accreditationNote: string | null }, actor: string): Promise<Laboratory> {
  const id = lab.id ?? randomUUID();
  const now = new Date().toISOString();
  await query(
    `INSERT INTO coa_laboratories (id, name, verification_hosts, accreditation_note, created_at, updated_at, updated_by)
     VALUES ($1, $2, $3, $4, $5, $5, $6)
     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, verification_hosts = EXCLUDED.verification_hosts,
       accreditation_note = EXCLUDED.accreditation_note, updated_at = EXCLUDED.updated_at, updated_by = EXCLUDED.updated_by`,
    [id, lab.name, lab.verificationHosts, lab.accreditationNote, now, actor]
  );
  return (await listLabs()).find((l) => l.id === id)!;
}

export async function deleteLab(id: string): Promise<boolean> {
  const used = await query<{ n: number }>("SELECT count(*)::int AS n FROM coa_records WHERE laboratory_id = $1", [id]);
  if (Number(used[0].n) > 0) return false;
  await query("DELETE FROM coa_laboratories WHERE id = $1", [id]);
  return true;
}

// --- Acceptance criteria -------------------------------------------------------------------------------------------

type CriteriaRow = {
  product_slug: string;
  applies: boolean;
  min_purity_percent: string | number | null;
  quantity_min_percent: string | number | null;
  quantity_max_percent: string | number | null;
  required_tests: string[] | string;
};

export async function listCriteria(): Promise<AcceptanceCriteria[]> {
  const rows = await query<CriteriaRow>("SELECT * FROM coa_acceptance_criteria ORDER BY product_slug");
  return rows.map((r) => ({
    productSlug: r.product_slug,
    applies: r.applies,
    minPurityPercent: num(r.min_purity_percent),
    quantityMinPercent: num(r.quantity_min_percent),
    quantityMaxPercent: num(r.quantity_max_percent),
    requiredTests: parseArray(r.required_tests),
  }));
}

export async function saveCriteria(c: AcceptanceCriteria, actor: string): Promise<void> {
  await query(
    `INSERT INTO coa_acceptance_criteria (product_slug, applies, min_purity_percent, quantity_min_percent, quantity_max_percent, required_tests, updated_at, updated_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (product_slug) DO UPDATE SET applies = EXCLUDED.applies, min_purity_percent = EXCLUDED.min_purity_percent,
       quantity_min_percent = EXCLUDED.quantity_min_percent, quantity_max_percent = EXCLUDED.quantity_max_percent,
       required_tests = EXCLUDED.required_tests, updated_at = EXCLUDED.updated_at, updated_by = EXCLUDED.updated_by`,
    [c.productSlug, c.applies, c.minPurityPercent, c.quantityMinPercent, c.quantityMaxPercent, c.requiredTests, new Date().toISOString(), actor]
  );
}

export async function deleteCriteria(slug: string): Promise<void> {
  if (slug === "*") return; // the default stays
  await query("DELETE FROM coa_acceptance_criteria WHERE product_slug = $1", [slug]);
}

// --- Audit ---------------------------------------------------------------------------------------------------------

export type AuditEntry = { id: string; recordId: string | null; action: string; actor: string; at: string; details: unknown };

export async function audit(recordId: string | null, action: string, actor: string, details: unknown = null): Promise<void> {
  await query(
    "INSERT INTO coa_audit (id, record_id, action, actor, at, details) VALUES ($1, $2, $3, $4, $5, $6::jsonb)",
    [randomUUID(), recordId, action, actor, new Date().toISOString(), details === null ? null : JSON.stringify(details)]
  );
}

export async function listAudit(recordId: string): Promise<AuditEntry[]> {
  const rows = await query<{ id: string; record_id: string | null; action: string; actor: string; at: string; details: unknown }>(
    "SELECT * FROM coa_audit WHERE record_id = $1 ORDER BY at DESC, id",
    [recordId]
  );
  return rows.map((r) => ({ id: r.id, recordId: r.record_id, action: r.action, actor: r.actor, at: r.at, details: typeof r.details === "string" ? JSON.parse(r.details) : r.details }));
}
