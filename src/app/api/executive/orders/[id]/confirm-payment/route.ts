import { NextResponse } from "next/server";
import { requireExecutiveActor } from "@/lib/executive/require-auth";
import { getOrderById } from "@/lib/orders/store";
import { confirmPayment } from "@/lib/orders/lifecycle";
import { isHumanVerified, methodLabel } from "@/lib/payments/methods";
import { confirmPaymentSchema, parseBody } from "@/lib/validation";
import { withApiErrorHandling } from "@/lib/api-error";
import { inventoryErrorResponse, notFound, unauthorized } from "@/lib/executive/route-helpers";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

// An administrator confirms a payment THEY verified (Zelle, bank transfer) — governance C: never a bare toggle. The
// request must carry the confirmation reference / transaction id from the payment notification, the amount and
// date received, and an attestation. All of it is stored on the order and in its history with the administrator
// and time. The amount must equal the order total (owner decision Q3), else the order goes to review instead.
// Provider-verified methods (crypto, ACH, cards) can't be confirmed here: only the provider's notification can.
export const POST = withApiErrorHandling(async (request: Request, { params }: Params) => {
  const actor = await requireExecutiveActor();
  if (!actor) return unauthorized();
  const { id } = await params;
  const order = await getOrderById(id);
  if (!order) return notFound();
  if (!isHumanVerified(order.paymentMethod)) {
    return NextResponse.json(
      { error: `${methodLabel(order.paymentMethod)} payments are confirmed only by the payment provider, not by hand.` },
      { status: 400 }
    );
  }
  const parsed = await parseBody(request, confirmPaymentSchema);
  if ("error" in parsed) return parsed.error;
  try {
    const r = await confirmPayment({
      order, actor, source: "admin", reference: parsed.data.reference, amount: parsed.data.amountReceived,
      receivedOn: parsed.data.receivedOn, note: parsed.data.note,
    });
    if (r.outcome === "amount_mismatch") {
      return NextResponse.json(
        { error: "The amount received doesn't match the order total. The payment was NOT confirmed; the order is in Administrative Review.", outcome: r.outcome, order: r.order },
        { status: 409 }
      );
    }
    if (r.outcome === "already_confirmed") {
      return NextResponse.json({ error: "This order's payment is already confirmed. Nothing was changed.", outcome: r.outcome, order: r.order }, { status: 409 });
    }
    return NextResponse.json({ outcome: r.outcome, review: r.review, order: r.order });
  } catch (err) {
    return inventoryErrorResponse(err);
  }
});
