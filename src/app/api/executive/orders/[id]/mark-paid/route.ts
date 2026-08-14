import { NextResponse } from "next/server";
import { requireExecutiveSession } from "@/lib/executive/require-auth";
import { getOrderById, updateOrder } from "@/lib/orders/store";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
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
  if (order.paymentMethod !== "bank_transfer") {
    return NextResponse.json(
      { error: "Only bank transfer orders can be marked paid manually." },
      { status: 400 }
    );
  }

  const updated = await updateOrder(order.id, {
    status: "paid",
    paidAt: new Date().toISOString(),
  });

  return NextResponse.json({ order: updated });
}
