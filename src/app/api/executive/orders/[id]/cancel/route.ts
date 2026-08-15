import { NextResponse } from "next/server";
import { requireExecutiveSession } from "@/lib/executive/require-auth";
import { getOrderById } from "@/lib/orders/store";
import { cancelOrder } from "@/lib/orders/lifecycle";
import { orderCancelSchema, parseBody } from "@/lib/validation";
import { logActivity } from "@/lib/activity-log";
import { getCurrentCustomer } from "@/lib/users/current-user";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await requireExecutiveSession())) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { id } = await params;
  const order = await getOrderById(id);
  if (!order) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }

  const parsed = await parseBody(request, orderCancelSchema);
  if ("error" in parsed) return parsed.error;

  try {
    const updated = await cancelOrder(order, parsed.data.reason);
    const actor = await getCurrentCustomer();
    if (actor) await logActivity(actor.email, "order.cancelled", order.reference);
    return NextResponse.json({ order: updated });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not cancel order." },
      { status: 400 }
    );
  }
}
