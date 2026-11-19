import { NextResponse } from "next/server";
import { z } from "zod";
import { requireExecutiveActor } from "@/lib/executive/require-auth";
import { getOrderByReference } from "@/lib/orders/store";
import { applyPaymentUpdate, confirmPayment } from "@/lib/orders/lifecycle";
import { isPaymentSimulation } from "@/lib/payments/config";
import { isHumanVerified } from "@/lib/payments/methods";
import { parseBody } from "@/lib/validation";
import { withApiErrorHandling } from "@/lib/api-error";
import { inventoryErrorResponse, unauthorized } from "@/lib/executive/route-helpers";

export const dynamic = "force-dynamic";

// LOCAL TEST HARNESS ONLY. Posts a SIMULATED provider event (what a verified provider webhook would deliver) for a
// provider-verified order, so the order/inventory paths can be tested without any provider. It does not exist
// outside local simulation (404): isPaymentSimulation() needs PAYMENT_SIMULATION=local-test-only, a database under
// the reserved .invalid domain, and not running on Vercel. Every event it records has source "simulated" and is
// never presented as a real payment.
const schema = z.object({
  reference: z.string().trim().min(3).max(40),
  kind: z.enum(["processing", "confirmed", "failed", "reversed"]),
  eventId: z.string().trim().min(3).max(100),
  amount: z.number().positive().max(1_000_000).optional(),
  reason: z.string().trim().max(200).optional(),
});

export const POST = withApiErrorHandling(async (request: Request) => {
  if (!isPaymentSimulation()) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (!(await requireExecutiveActor())) return unauthorized();
  const parsed = await parseBody(request, schema);
  if ("error" in parsed) return parsed.error;
  const order = await getOrderByReference(parsed.data.reference);
  if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 });
  if (isHumanVerified(order.paymentMethod)) {
    return NextResponse.json({ error: "Human-verified methods have no provider events; confirm them with a reference." }, { status: 400 });
  }
  const provider = `simulated-${order.paymentMethod}`;
  try {
    if (parsed.data.kind === "confirmed") {
      const r = await confirmPayment({
        order, actor: `provider:${provider}`, source: "simulated", reference: `SIM-${parsed.data.eventId}`,
        amount: parsed.data.amount ?? order.total, provider, providerEventId: parsed.data.eventId,
      });
      return NextResponse.json({ simulated: true, outcome: r.outcome, review: r.review, order: r.order });
    }
    const r = await applyPaymentUpdate(order, parsed.data.kind, {
      actor: `provider:${provider}`, source: "simulated", provider, providerEventId: parsed.data.eventId,
      details: parsed.data.reason ? { reason: parsed.data.reason } : {},
    });
    return NextResponse.json({ simulated: true, outcome: r.outcome, review: r.review, order: await getOrderByReference(order.reference) });
  } catch (err) {
    return inventoryErrorResponse(err);
  }
});
