import { randomUUID } from "crypto";
import { query } from "@/lib/db";
import type { AnalyticsEventType, FunnelStats } from "@/lib/types";

export async function trackEvent(
  event: AnalyticsEventType,
  sessionId: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  await query(
    `INSERT INTO analytics_events (id, event_type, session_id, metadata, created_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [randomUUID(), event, sessionId, metadata ? JSON.stringify(metadata) : null, new Date().toISOString()]
  );
}

// Counts distinct sessions per event type within the window — a session
// that viewed 5 pages only counts once toward pageViews, so the funnel
// reflects visitors, not raw event volume.
export async function computeFunnel(days: number): Promise<FunnelStats> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const rows = await query<{ event_type: AnalyticsEventType; count: number }>(
    `SELECT event_type, COUNT(DISTINCT session_id)::int AS count
     FROM analytics_events
     WHERE created_at >= $1
     GROUP BY event_type`,
    [since]
  );
  const byType = new Map(rows.map((r) => [r.event_type, Number(r.count)]));
  return {
    pageViews: byType.get("page_view") ?? 0,
    addToCart: byType.get("add_to_cart") ?? 0,
    checkoutStarted: byType.get("checkout_started") ?? 0,
    orderCompleted: byType.get("order_completed") ?? 0,
  };
}
