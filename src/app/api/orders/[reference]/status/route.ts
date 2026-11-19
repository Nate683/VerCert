import { NextResponse } from "next/server";
import { getOrderByReference } from "@/lib/orders/store";
import { markOrderPaid } from "@/lib/orders/lifecycle";
import { sweepExpiredReservations } from "@/lib/inventory";
import { getCoinbaseCharge, isChargeConfirmed } from "@/lib/coinbase";
import { withApiErrorHandling } from "@/lib/api-error";

export const dynamic = "force-dynamic";

export const GET = withApiErrorHandling(async (
  _request: Request,
  { params }: { params: Promise<{ reference: string }> }
) => {
  const { reference } = await params;
  let order = await getOrderByReference(reference);
  if (!order) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }

  // Stage 3: a reservation whose time has run out is released (and the order marked expired) by the server — here as
  // well as by the cron sweep and at checkout, so the customer never sees a hold that no longer exists.
  if (order.paymentStatus === "pending" && order.reservationExpiresAt && Date.parse(order.reservationExpiresAt) <= Date.now()) {
    await sweepExpiredReservations("system:expiry", "order-page");
    order = (await getOrderByReference(reference)) ?? order;
  }

  // Legacy Coinbase Commerce orders only (the provider has shut down): best-effort reconciliation if a webhook
  // never arrived. Confirmation goes through the same database function as every other payment.
  if (order.paymentMethod === "crypto" && order.status === "awaiting_payment" && order.crypto) {
    try {
      const charge = await getCoinbaseCharge(order.crypto.chargeId);
      if (isChargeConfirmed(charge.timeline)) {
        order = (await markOrderPaid(order, `poll:${order.crypto.chargeId}`)) ?? order;
      }
    } catch (err) {
      console.error("Coinbase charge reconciliation failed:", err);
    }
  }

  // Only return non-sensitive fields — this endpoint is reachable with just the order reference.
  return NextResponse.json({
    reference: order.reference,
    status: order.status,
    paidAt: order.paidAt ?? null,
    expiresAt: order.reservationExpiresAt ?? order.crypto?.expiresAt ?? null,
  });
});
