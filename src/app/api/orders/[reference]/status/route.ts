import { NextResponse } from "next/server";
import { getOrderByReference, updateOrder } from "@/lib/orders/store";
import { markOrderPaid } from "@/lib/orders/lifecycle";
import { getCoinbaseCharge, isChargeConfirmed } from "@/lib/coinbase";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ reference: string }> }
) {
  const { reference } = await params;
  const order = await getOrderByReference(reference);
  if (!order) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }

  let status = order.status;
  let paidAt = order.paidAt;

  // Best-effort reconciliation with Coinbase in case the webhook hasn't fired
  // (e.g. no publicly reachable webhook URL in local development).
  if (order.paymentMethod === "crypto" && status === "awaiting_payment" && order.crypto) {
    try {
      const charge = await getCoinbaseCharge(order.crypto.chargeId);
      if (isChargeConfirmed(charge.timeline)) {
        const updated = await markOrderPaid(order);
        status = updated?.status ?? "paid";
        paidAt = updated?.paidAt;
      } else if (new Date(order.crypto.expiresAt).getTime() < Date.now()) {
        const updated = await updateOrder(order.id, { status: "expired" });
        status = updated?.status ?? "expired";
      }
    } catch (err) {
      console.error("Coinbase charge reconciliation failed:", err);
    }
  }

  // Only return non-sensitive fields — this endpoint is reachable with just the order reference.
  return NextResponse.json({
    reference: order.reference,
    status,
    paidAt: paidAt ?? null,
    expiresAt: order.crypto?.expiresAt ?? null,
  });
}
