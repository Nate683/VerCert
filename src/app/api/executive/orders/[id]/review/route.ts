import { NextResponse } from "next/server";
import { requireExecutiveActor } from "@/lib/executive/require-auth";
import { getOrderById } from "@/lib/orders/store";
import { allocateNow, closeReview } from "@/lib/orders/lifecycle";
import { resolveReviewSchema, parseBody } from "@/lib/validation";
import { withApiErrorHandling } from "@/lib/api-error";
import { inventoryErrorResponse, notFound, unauthorized } from "@/lib/executive/route-helpers";

export const dynamic = "force-dynamic";

// Resolves an order in Administrative Review: "allocate" tries to deduct stock now (FIFO from approved lots; refused
// with nothing changed if there still isn't enough), "close" closes the review with a written note (e.g. after
// recording a refund).
export const POST = withApiErrorHandling(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const actor = await requireExecutiveActor();
  if (!actor) return unauthorized();
  const { id } = await params;
  const order = await getOrderById(id);
  if (!order) return notFound();
  const parsed = await parseBody(request, resolveReviewSchema);
  if ("error" in parsed) return parsed.error;
  try {
    const updated = parsed.data.action === "allocate" ? await allocateNow(order, actor) : await closeReview(order, actor, parsed.data.note!);
    return NextResponse.json({ order: updated });
  } catch (err) {
    return inventoryErrorResponse(err);
  }
});
