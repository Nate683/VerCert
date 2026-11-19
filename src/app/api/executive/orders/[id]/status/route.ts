import { NextResponse } from "next/server";
import { requireExecutiveActor } from "@/lib/executive/require-auth";
import { getOrderById } from "@/lib/orders/store";
import { advanceOrderStatus } from "@/lib/orders/lifecycle";
import { orderStatusUpdateSchema, parseBody } from "@/lib/validation";
import { logActivity } from "@/lib/activity-log";
import { withApiErrorHandling } from "@/lib/api-error";
import { inventoryErrorResponse, notFound, unauthorized } from "@/lib/executive/route-helpers";

export const dynamic = "force-dynamic";

// Fulfillment: allocated → processing → shipped (tracking required) → delivered. The database refuses a step that
// isn't allowed (unpaid, open review, a lot no longer approved, backwards).
export const PATCH = withApiErrorHandling(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const actor = await requireExecutiveActor();
  if (!actor) return unauthorized();
  const { id } = await params;
  const order = await getOrderById(id);
  if (!order) return notFound();
  const parsed = await parseBody(request, orderStatusUpdateSchema);
  if ("error" in parsed) return parsed.error;
  const { status, carrier, trackingNumber } = parsed.data;
  try {
    const updated = await advanceOrderStatus(order, status, { carrier, trackingNumber, actor });
    await logActivity(actor.email, "order.status_updated", `${order.reference} → ${status}${trackingNumber ? ` (${carrier ?? ""} ${trackingNumber})` : ""}`);
    return NextResponse.json({ order: updated });
  } catch (err) {
    return inventoryErrorResponse(err);
  }
});
