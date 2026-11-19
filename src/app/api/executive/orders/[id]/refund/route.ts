import { NextResponse } from "next/server";
import { requireExecutiveActor } from "@/lib/executive/require-auth";
import { getOrderById } from "@/lib/orders/store";
import { refundOrder } from "@/lib/orders/lifecycle";
import { refundOrderSchema, parseBody } from "@/lib/validation";
import { withApiErrorHandling } from "@/lib/api-error";
import { logActivity } from "@/lib/activity-log";
import { inventoryErrorResponse, notFound, unauthorized } from "@/lib/executive/route-helpers";

export const dynamic = "force-dynamic";

// Records a refund. This records money going back — it does not move money (no processor is connected).
// Refunds accumulate and can never exceed what was paid (enforced in the database). Below that the payment is
// "partially refunded"; the refund that completes it makes it "refunded" and (owner decision Q1) cancels an unshipped
// order and restores its stock; after shipment NO stock changes — returned goods come back only through Record
// Return, with an explicit restocking decision.
export const POST = withApiErrorHandling(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const actor = await requireExecutiveActor();
  if (!actor) return unauthorized();
  const { id } = await params;
  const order = await getOrderById(id);
  if (!order) return notFound();
  const parsed = await parseBody(request, refundOrderSchema);
  if ("error" in parsed) return parsed.error;
  try {
    const { order: updated, result } = await refundOrder(order, parsed.data.reason, {
      amount: parsed.data.amount, note: parsed.data.note, actor, idempotencyKey: parsed.data.idempotencyKey,
    });
    if (result.outcome !== "duplicate") {
      await logActivity(actor.email, result.outcome === "refunded" ? "order.refunded" : "order.partially_refunded",
        `${order.reference} — $${Number(result.amount).toFixed(2)} (${parsed.data.reason}); refunded ${result.refunded_total} of ${result.paid}`);
    }
    return NextResponse.json({ order: updated, result });
  } catch (err) {
    return inventoryErrorResponse(err);
  }
});
