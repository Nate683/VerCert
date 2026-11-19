import { NextResponse } from "next/server";
import { requireExecutiveActor } from "@/lib/executive/require-auth";
import { getSweepHeartbeat, listReservations, sweepExpiredReservations } from "@/lib/inventory";
import { withApiErrorHandling } from "@/lib/api-error";
import { logActivity } from "@/lib/activity-log";
import { noStore, unauthorized } from "@/lib/executive/route-helpers";

export const dynamic = "force-dynamic";

// Executive Office → Reservations (governance B). Every live reservation (order, SKU, lot, quantity, created,
// expires), with those past their expiry and not yet released flagged, plus the expiry job's heartbeat — so a
// stopped job is visible instead of silently draining sellable stock.
export const GET = withApiErrorHandling(async () => {
  if (!(await requireExecutiveActor())) return unauthorized();
  const [reservations, heartbeat] = await Promise.all([listReservations(), getSweepHeartbeat()]);
  return NextResponse.json({ reservations, heartbeat, now: new Date().toISOString() }, noStore);
});

// Runs the expiry sweep now (same function as the cron). Safe to repeat.
export const POST = withApiErrorHandling(async () => {
  const actor = await requireExecutiveActor();
  if (!actor) return unauthorized();
  const released = await sweepExpiredReservations(`admin:${actor.email}`, "admin");
  await logActivity(actor.email, "inventory.reservation_sweep", `released ${released}`);
  return NextResponse.json({ released });
});
