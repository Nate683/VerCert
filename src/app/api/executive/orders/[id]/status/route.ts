import { NextResponse } from "next/server";
import { requireExecutiveSession } from "@/lib/executive/require-auth";
import { getOrderById } from "@/lib/orders/store";
import { advanceOrderStatus } from "@/lib/orders/lifecycle";
import { orderStatusUpdateSchema, parseBody } from "@/lib/validation";
import { logActivity } from "@/lib/activity-log";
import { getCurrentCustomer } from "@/lib/users/current-user";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const actor = await getCurrentCustomer();
  if (!actor || (actor.role !== "command" && actor.role !== "office")) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { id } = await params;
  const order = await getOrderById(id);
  if (!order) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }

  const parsed = await parseBody(request, orderStatusUpdateSchema);
  if ("error" in parsed) return parsed.error;
  const { status, carrier, trackingNumber } = parsed.data;

  try {
    const updated = await advanceOrderStatus(order, status, { carrier, trackingNumber });
    await logActivity(actor.email, "order.status_updated", `${order.reference} → ${status}`);
    return NextResponse.json({ order: updated });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not update order status." },
      { status: 400 }
    );
  }
}
