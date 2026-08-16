import { randomUUID } from "crypto";
import { query } from "@/lib/db";
import type { HqResource } from "@/lib/types";

type ResourceRow = {
  id: string;
  title: string;
  description: string | null;
  file_url: string;
  file_type: string | null;
  uploaded_by: string | null;
  created_at: string;
};

function rowToResource(row: ResourceRow): HqResource {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? undefined,
    fileUrl: row.file_url,
    fileType: row.file_type ?? undefined,
    uploadedBy: row.uploaded_by ?? undefined,
    createdAt: row.created_at,
  };
}

const SELECT_ALL = "SELECT * FROM hq_resources";

export async function listResources(): Promise<HqResource[]> {
  const rows = await query<ResourceRow>(`${SELECT_ALL} ORDER BY created_at DESC`);
  return rows.map(rowToResource);
}

export async function createResource(input: {
  title: string;
  description?: string;
  fileUrl: string;
  fileType?: string;
  uploadedBy?: string;
}): Promise<HqResource> {
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  await query(
    `INSERT INTO hq_resources (id, title, description, file_url, file_type, uploaded_by, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [id, input.title, input.description ?? null, input.fileUrl, input.fileType ?? null, input.uploadedBy ?? null, createdAt]
  );
  return {
    id,
    title: input.title,
    description: input.description,
    fileUrl: input.fileUrl,
    fileType: input.fileType,
    uploadedBy: input.uploadedBy,
    createdAt,
  };
}

export async function deleteResource(id: string): Promise<void> {
  await query("DELETE FROM hq_resources WHERE id = $1", [id]);
}
