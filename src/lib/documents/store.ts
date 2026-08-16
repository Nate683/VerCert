import { randomUUID } from "crypto";
import { query } from "@/lib/db";
import type { CompanyDocument } from "@/lib/types";

type DocumentRow = {
  id: string;
  name: string;
  category: string;
  file_url: string;
  uploaded_by: string | null;
  created_at: string;
};

function rowToDocument(row: DocumentRow): CompanyDocument {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    fileUrl: row.file_url,
    uploadedBy: row.uploaded_by ?? undefined,
    createdAt: row.created_at,
  };
}

export async function listDocuments(): Promise<CompanyDocument[]> {
  const rows = await query<DocumentRow>("SELECT * FROM documents ORDER BY created_at DESC");
  return rows.map(rowToDocument);
}

export async function createDocument(input: {
  name: string;
  category: string;
  fileUrl: string;
  uploadedBy?: string;
}): Promise<CompanyDocument> {
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  await query(
    `INSERT INTO documents (id, name, category, file_url, uploaded_by, created_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, input.name, input.category, input.fileUrl, input.uploadedBy ?? null, createdAt]
  );
  return { id, name: input.name, category: input.category, fileUrl: input.fileUrl, uploadedBy: input.uploadedBy, createdAt };
}

export async function deleteDocument(id: string): Promise<void> {
  await query("DELETE FROM documents WHERE id = $1", [id]);
}
