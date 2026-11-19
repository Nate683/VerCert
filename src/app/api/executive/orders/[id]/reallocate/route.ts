import { NextResponse } from "next/server";
import { requireExecutiveActor } from "@/lib/executive/require-auth";
import { getOrderById } from "@/lib/orders/store";
import { reallocateOrder } from "@/lib/orders/lifecycle";
import { reallocateSchema, parseBody } from "@/lib/validation";
import { withApiErrorHandling } from "@/lib/api-error";
import { inventoryErrorResponse, notFound, unauthorized } from "@/lib/executive/route-helpers";

export const dynamic = "force-dynamic";

// Controlled reallocation: for an unshipped order filled from a lot that is no longer eligible, move those units onto
// approved lots of the SAME strength in one atomic database call (original allocation kept in history, reason and
// administrator recorded). Never uses a quarantined, pending, rejected, failed or expired lot. If approved stock is
// short, nothing moves: 200 with outcome "on_hold" and the order stays in Administrative Review.
export const POST = withApiErrorHandling(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const actor = await requireExecutiveActor();
  if (!actor) return unauthorized();
  const { id } = await params;
  const order = await getOrderById(id);
  if (!order) return notFound();
  const parsed = await parseBody(request, reallocateSchema);
  if ("error" in parsed) return parsed.error;
  try {
    const { order: updated, result } = await reallocateOrder(order, actor, parsed.data.reason);
    return NextResponse.json({ order: updated, result, outcome: result.outcome, review: result.review ?? null });
  } catch (err) {
    return inventoryErrorResponse(err);
  }
});
