import { NextResponse } from "next/server";
import { requireExecutiveActor } from "@/lib/executive/require-auth";
import { releaseReservation } from "@/lib/inventory";
import { releaseReservationSchema, parseBody } from "@/lib/validation";
import { withApiErrorHandling } from "@/lib/api-error";
import { logActivity } from "@/lib/activity-log";
import { inventoryErrorResponse, unauthorized } from "@/lib/executive/route-helpers";

export const dynamic = "force-dynamic";

// Manually releases one reservation (governance B): the reason and the administrator are written to the inventory
// movement and the order's history. A payment that arrives afterwards goes to Administrative Review.
export const POST = withApiErrorHandling(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const actor = await requireExecutiveActor();
  if (!actor) return unauthorized();
  const { id } = await params;
  const parsed = await parseBody(request, releaseReservationSchema);
  if ("error" in parsed) return parsed.error;
  try {
    const r = await releaseReservation(id, `admin:${actor.email}`, parsed.data.reason);
    if (r.outcome === "not_reserved") return NextResponse.json({ error: "That reservation is no longer held (already released or committed).", outcome: r.outcome }, { status: 409 });
    await logActivity(actor.email, "inventory.reservation_released", `${id} — ${parsed.data.reason}`);
    return NextResponse.json({ outcome: r.outcome });
  } catch (err) {
    return inventoryErrorResponse(err);
  }
});
