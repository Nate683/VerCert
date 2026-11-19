import { NextResponse } from "next/server";
import { requireExecutiveActor } from "@/lib/executive/require-auth";
import { getOrderById } from "@/lib/orders/store";
import { recordReturn } from "@/lib/orders/lifecycle";
import { orderReturnSchema, parseBody } from "@/lib/validation";
import { withApiErrorHandling } from "@/lib/api-error";
import { inventoryErrorResponse, notFound, unauthorized } from "@/lib/executive/route-helpers";

export const dynamic = "force-dynamic";

// Records goods coming back from a shipped order, with the restocking decision: restock (into the lot it shipped
// from — sellable only if that lot is approved), quarantine (the strength's returns lot, not sellable) or discard
// (no stock change). A repeated submission is recorded once.
export const POST = withApiErrorHandling(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const actor = await requireExecutiveActor();
  if (!actor) return unauthorized();
  const { id } = await params;
  const order = await getOrderById(id);
  if (!order) return notFound();
  const parsed = await parseBody(request, orderReturnSchema);
  if ("error" in parsed) return parsed.error;
  try {
    const result = await recordReturn(order, { ...parsed.data, actor });
    return NextResponse.json({ result, order: await getOrderById(id) });
  } catch (err) {
    return inventoryErrorResponse(err);
  }
});
