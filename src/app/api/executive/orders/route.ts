import { NextResponse } from "next/server";
import { requireExecutiveSession } from "@/lib/executive/require-auth";
import { listOrders } from "@/lib/orders/store";
import type { OrderStatus, PaymentMethod } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!(await requireExecutiveSession())) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") as OrderStatus | null;
  const paymentMethod = searchParams.get("paymentMethod") as PaymentMethod | null;
  const search = searchParams.get("search")?.trim().toLowerCase();

  let orders = await listOrders();
  if (status) orders = orders.filter((o) => o.status === status);
  if (paymentMethod) orders = orders.filter((o) => o.paymentMethod === paymentMethod);
  if (search) {
    orders = orders.filter(
      (o) =>
        o.reference.toLowerCase().includes(search) ||
        o.customer.email.toLowerCase().includes(search) ||
        `${o.customer.firstName} ${o.customer.lastName}`.toLowerCase().includes(search)
    );
  }

  return NextResponse.json({ orders });
}
