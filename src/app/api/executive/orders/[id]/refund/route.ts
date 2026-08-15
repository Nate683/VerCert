import { NextResponse } from "next/server";
import { requireExecutiveSession } from "@/lib/executive/require-auth";
import { getOrderById } from "@/lib/orders/store";
import { refundOrder } from "@/lib/orders/lifecycle";
import { refundOrderSchema, parseBody } from "@/lib/validation";
import { withApiErrorHandling } from "@/lib/api-error";
import { logActivity } from "@/lib/activity-log";
import { getCurrentCustomer } from "@/lib/users/current-user";

export const dynamic = "force-dynamic";

export const POST = withApiErrorHandling(async (
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) => {
  const actor = await getCurrentCustomer();
  if (!actor || (actor.role !== "command" && actor.role !== "office")) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { id } = await params;
  const order = await getOrderById(id);
  if (!order) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }

  const parsed = await parseBody(request, refundOrderSchema);
  if ("error" in parsed) return parsed.error;

  try {
    const updated = await refundOrder(order, parsed.data.reason, {
      amount: parsed.data.amount,
      note: parsed.data.note,
    });
    await logActivity(actor.email, "order.refunded", `${order.reference} — ${parsed.data.reason}`);
    return NextResponse.json({ order: updated });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not refund order." },
      { status: 400 }
    );
  }
});
