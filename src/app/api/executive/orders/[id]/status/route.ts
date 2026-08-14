import { NextResponse } from "next/server";
import { requireExecutiveSession } from "@/lib/executive/require-auth";
import { getOrderById } from "@/lib/orders/store";
import { advanceOrderStatus } from "@/lib/orders/lifecycle";
import { orderStatusUpdateSchema, parseBody } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function PATCH(
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

  const parsed = await parseBody(request, orderStatusUpdateSchema);
  if ("error" in parsed) return parsed.error;
  const { status, carrier, trackingNumber } = parsed.data;

  try {
    const updated = await advanceOrderStatus(order, status, { carrier, trackingNumber });
    return NextResponse.json({ order: updated });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not update order status." },
      { status: 400 }
    );
  }
}
