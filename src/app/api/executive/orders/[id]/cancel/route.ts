import { NextResponse } from "next/server";
import { requireExecutiveActor } from "@/lib/executive/require-auth";
import { getOrderById } from "@/lib/orders/store";
import { cancelOrder } from "@/lib/orders/lifecycle";
import { orderCancelSchema, parseBody } from "@/lib/validation";
import { logActivity } from "@/lib/activity-log";
import { withApiErrorHandling } from "@/lib/api-error";
import { inventoryErrorResponse, notFound, unauthorized } from "@/lib/executive/route-helpers";

export const dynamic = "force-dynamic";

// Cancels an order before shipment: releases any reservation and puts deducted units back into the lots they came
// from (one database call; a repeat is a no-op). A paid order cancelled here is flagged to have its refund recorded.
export const POST = withApiErrorHandling(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const actor = await requireExecutiveActor();
  if (!actor) return unauthorized();
  const { id } = await params;
  const order = await getOrderById(id);
  if (!order) return notFound();
  const parsed = await parseBody(request, orderCancelSchema);
  if ("error" in parsed) return parsed.error;
  try {
    const updated = await cancelOrder(order, parsed.data.reason, actor, "admin");
    await logActivity(actor.email, "order.cancelled", `${order.reference}${parsed.data.reason ? ` — ${parsed.data.reason}` : ""}`);
    return NextResponse.json({ order: updated });
  } catch (err) {
    return inventoryErrorResponse(err);
  }
});
