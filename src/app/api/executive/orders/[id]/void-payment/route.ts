import { NextResponse } from "next/server";
import { requireExecutiveActor } from "@/lib/executive/require-auth";
import { getOrderById } from "@/lib/orders/store";
import { voidPaymentConfirmation } from "@/lib/orders/lifecycle";
import { voidPaymentSchema, parseBody } from "@/lib/validation";
import { withApiErrorHandling } from "@/lib/api-error";
import { inventoryErrorResponse, notFound, unauthorized } from "@/lib/executive/route-helpers";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

// Voids an administrator's payment confirmation (owner decision Q4): only before shipment, with a written reason.
// Deducted units go back to their lots; the order returns to awaiting payment; the original confirmation (who,
// when, which reference) stays in the order history.
export const POST = withApiErrorHandling(async (request: Request, { params }: Params) => {
  const actor = await requireExecutiveActor();
  if (!actor) return unauthorized();
  const { id } = await params;
  const order = await getOrderById(id);
  if (!order) return notFound();
  const parsed = await parseBody(request, voidPaymentSchema);
  if ("error" in parsed) return parsed.error;
  try {
    return NextResponse.json({ order: await voidPaymentConfirmation(order, actor, parsed.data.reason) });
  } catch (err) {
    return inventoryErrorResponse(err);
  }
});
