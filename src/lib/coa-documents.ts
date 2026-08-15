import { query } from "@/lib/db";
import type { CoaDocument } from "@/lib/types";

// Server-only Postgres-backed store for uploaded COA files (PDF/image),
// keyed by batch number — separate from the auto-generated text COA in
// lib/coa.ts, which always renders regardless of whether a file exists.

type CoaDocumentRow = { batch_number: string; file_url: string; uploaded_at: string };

function rowToCoaDocument(row: CoaDocumentRow): CoaDocument {
  return { batchNumber: row.batch_number, fileUrl: row.file_url, uploadedAt: row.uploaded_at };
}

export async function listCoaDocuments(): Promise<CoaDocument[]> {
  const rows = await query<CoaDocumentRow>("SELECT * FROM coa_documents");
  return rows.map(rowToCoaDocument);
}

export async function getCoaDocument(batch: string): Promise<CoaDocument | null> {
  const rows = await query<CoaDocumentRow>(
    "SELECT * FROM coa_documents WHERE batch_number = $1",
    [batch]
  );
  return rows[0] ? rowToCoaDocument(rows[0]) : null;
}

export async function upsertCoaDocument(batch: string, fileUrl: string): Promise<CoaDocument> {
  const uploadedAt = new Date().toISOString();
  await query(
    `INSERT INTO coa_documents (batch_number, file_url, uploaded_at)
     VALUES ($1, $2, $3)
     ON CONFLICT (batch_number) DO UPDATE SET file_url = EXCLUDED.file_url, uploaded_at = EXCLUDED.uploaded_at`,
    [batch, fileUrl, uploadedAt]
  );
  return { batchNumber: batch, fileUrl, uploadedAt };
}

export async function deleteCoaDocument(batch: string): Promise<void> {
  await query("DELETE FROM coa_documents WHERE batch_number = $1", [batch]);
}
