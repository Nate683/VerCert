import { randomUUID } from "crypto";
import { query } from "@/lib/db";
import type { ActivityLogEntry } from "@/lib/types";

// Server-only Postgres-backed activity log — /command-only visibility, but
// any executive action (either realm) is recorded here. Logging failures
// are swallowed (best-effort) so a logging bug never blocks a real action.
export async function logActivity(actorEmail: string, action: string, details?: string): Promise<void> {
  try {
    await query(
      `INSERT INTO activity_log (id, actor_email, action, details, created_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [randomUUID(), actorEmail, action, details ?? null, new Date().toISOString()]
    );
  } catch (err) {
    console.error("Failed to record activity log entry:", err);
  }
}

export async function listActivity(limit = 200): Promise<ActivityLogEntry[]> {
  const rows = await query<{
    id: string;
    actor_email: string;
    action: string;
    details: string | null;
    created_at: string;
  }>("SELECT * FROM activity_log ORDER BY created_at DESC LIMIT $1", [limit]);
  return rows.map((r) => ({
    id: r.id,
    actorEmail: r.actor_email,
    action: r.action,
    details: r.details ?? undefined,
    createdAt: r.created_at,
  }));
}
