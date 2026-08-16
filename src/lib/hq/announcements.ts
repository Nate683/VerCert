import { randomUUID } from "crypto";
import { query } from "@/lib/db";
import type { HqAnnouncement } from "@/lib/types";

type AnnouncementRow = {
  id: string;
  author_name: string;
  title: string;
  body: string;
  pinned: boolean;
  created_at: string;
};

function rowToAnnouncement(row: AnnouncementRow): HqAnnouncement {
  return {
    id: row.id,
    authorName: row.author_name,
    title: row.title,
    body: row.body,
    pinned: row.pinned,
    createdAt: row.created_at,
  };
}

const SELECT_ALL = "SELECT * FROM hq_announcements";

// Pinned first, then newest first.
export async function listAnnouncements(): Promise<HqAnnouncement[]> {
  const rows = await query<AnnouncementRow>(`${SELECT_ALL} ORDER BY pinned DESC, created_at DESC`);
  return rows.map(rowToAnnouncement);
}

export async function createAnnouncement(input: {
  authorName: string;
  title: string;
  body: string;
  pinned?: boolean;
}): Promise<HqAnnouncement> {
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  await query(
    `INSERT INTO hq_announcements (id, author_name, title, body, pinned, created_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, input.authorName, input.title, input.body, input.pinned ?? false, createdAt]
  );
  return { id, authorName: input.authorName, title: input.title, body: input.body, pinned: input.pinned ?? false, createdAt };
}

export async function updateAnnouncement(
  id: string,
  patch: { title?: string; body?: string; pinned?: boolean }
): Promise<HqAnnouncement | null> {
  const fields: string[] = [];
  const values: unknown[] = [id];
  if (patch.title !== undefined) {
    values.push(patch.title);
    fields.push(`title = $${values.length}`);
  }
  if (patch.body !== undefined) {
    values.push(patch.body);
    fields.push(`body = $${values.length}`);
  }
  if (patch.pinned !== undefined) {
    values.push(patch.pinned);
    fields.push(`pinned = $${values.length}`);
  }
  if (fields.length > 0) {
    await query(`UPDATE hq_announcements SET ${fields.join(", ")} WHERE id = $1`, values);
  }
  const rows = await query<AnnouncementRow>(`${SELECT_ALL} WHERE id = $1`, [id]);
  return rows[0] ? rowToAnnouncement(rows[0]) : null;
}

export async function deleteAnnouncement(id: string): Promise<void> {
  await query("DELETE FROM hq_announcements WHERE id = $1", [id]);
}
