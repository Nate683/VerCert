import { randomUUID } from "crypto";
import { query } from "@/lib/db";
import type { MessageChannel, MessageTemplate } from "@/lib/types";

type TemplateRow = {
  id: string;
  name: string;
  channel: MessageChannel;
  subject: string | null;
  body: string;
  created_at: string;
  updated_at: string;
};

function rowToTemplate(row: TemplateRow): MessageTemplate {
  return {
    id: row.id,
    name: row.name,
    channel: row.channel,
    subject: row.subject ?? undefined,
    body: row.body,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listTemplates(): Promise<MessageTemplate[]> {
  const rows = await query<TemplateRow>("SELECT * FROM message_templates ORDER BY created_at DESC");
  return rows.map(rowToTemplate);
}

export async function createTemplate(input: {
  name: string;
  channel: MessageChannel;
  subject?: string;
  body: string;
}): Promise<MessageTemplate> {
  const id = randomUUID();
  const now = new Date().toISOString();
  await query(
    `INSERT INTO message_templates (id, name, channel, subject, body, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [id, input.name, input.channel, input.subject ?? null, input.body, now, now]
  );
  return { id, name: input.name, channel: input.channel, subject: input.subject, body: input.body, createdAt: now, updatedAt: now };
}

export async function deleteTemplate(id: string): Promise<void> {
  await query("DELETE FROM message_templates WHERE id = $1", [id]);
}
