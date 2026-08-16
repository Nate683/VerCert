import { randomUUID } from "crypto";
import { query } from "@/lib/db";
import type { HqMessage, HqMemberKind } from "@/lib/types";

type MessageRow = {
  id: string;
  channel: string;
  sender_id: string;
  sender_name: string;
  sender_kind: HqMemberKind;
  body: string;
  created_at: string;
};

function rowToMessage(row: MessageRow): HqMessage {
  return {
    id: row.id,
    channel: row.channel,
    senderId: row.sender_id,
    senderName: row.sender_name,
    senderKind: row.sender_kind,
    body: row.body,
    createdAt: row.created_at,
  };
}

export async function listMessages(channel: string, limit = 200): Promise<HqMessage[]> {
  const rows = await query<MessageRow>(
    "SELECT * FROM hq_messages WHERE channel = $1 ORDER BY created_at ASC LIMIT $2",
    [channel, limit]
  );
  return rows.map(rowToMessage);
}

export async function postMessage(input: {
  channel: string;
  senderId: string;
  senderName: string;
  senderKind: HqMemberKind;
  body: string;
}): Promise<HqMessage> {
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  await query(
    `INSERT INTO hq_messages (id, channel, sender_id, sender_name, sender_kind, body, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [id, input.channel, input.senderId, input.senderName, input.senderKind, input.body, createdAt]
  );
  return { id, channel: input.channel, senderId: input.senderId, senderName: input.senderName, senderKind: input.senderKind, body: input.body, createdAt };
}

export async function getMessageById(id: string): Promise<HqMessage | null> {
  const rows = await query<MessageRow>("SELECT * FROM hq_messages WHERE id = $1", [id]);
  return rows[0] ? rowToMessage(rows[0]) : null;
}

export async function deleteMessage(id: string): Promise<void> {
  await query("DELETE FROM hq_messages WHERE id = $1", [id]);
}

// Distinct DM channels involving this member id, most recent activity first.
export async function listDmChannelsFor(memberId: string): Promise<string[]> {
  const rows = await query<{ channel: string }>(
    `SELECT channel, MAX(created_at) as last_at FROM hq_messages
     WHERE channel LIKE 'dm:%' AND (channel LIKE 'dm:' || $1 || ':%' OR channel LIKE '%:' || $1)
     GROUP BY channel
     ORDER BY last_at DESC`,
    [memberId]
  );
  return rows.map((r) => r.channel);
}
