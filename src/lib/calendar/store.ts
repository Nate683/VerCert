import { randomUUID } from "crypto";
import { query } from "@/lib/db";
import type { CalendarEvent, CalendarEventType } from "@/lib/types";

type CalendarEventRow = {
  id: string;
  title: string;
  type: CalendarEventType;
  date: string;
  notes: string | null;
  created_at: string;
};

function rowToEvent(row: CalendarEventRow): CalendarEvent {
  return {
    id: row.id,
    title: row.title,
    type: row.type,
    date: row.date,
    notes: row.notes ?? undefined,
    createdAt: row.created_at,
  };
}

export async function listCalendarEvents(): Promise<CalendarEvent[]> {
  const rows = await query<CalendarEventRow>("SELECT * FROM calendar_events ORDER BY date ASC");
  return rows.map(rowToEvent);
}

export async function createCalendarEvent(input: {
  title: string;
  type: CalendarEventType;
  date: string;
  notes?: string;
}): Promise<CalendarEvent> {
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  await query(
    `INSERT INTO calendar_events (id, title, type, date, notes, created_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, input.title, input.type, input.date, input.notes ?? null, createdAt]
  );
  return { id, title: input.title, type: input.type, date: input.date, notes: input.notes, createdAt };
}

export async function deleteCalendarEvent(id: string): Promise<void> {
  await query("DELETE FROM calendar_events WHERE id = $1", [id]);
}
