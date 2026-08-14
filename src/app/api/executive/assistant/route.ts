import { NextResponse } from "next/server";
import { requireExecutiveSession } from "@/lib/executive/require-auth";
import { listOrders } from "@/lib/orders/store";
import { listUsers } from "@/lib/users/store";
import { computeOverview } from "@/lib/executive/stats";
import { computeCustomerSummaries } from "@/lib/executive/customers";
import { getLowInventoryAlerts } from "@/lib/inventory";
import { askStoreAssistant } from "@/lib/anthropic";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!(await requireExecutiveSession())) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  let body: { question?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (!body.question?.trim()) {
    return NextResponse.json({ error: "A question is required." }, { status: 400 });
  }

  const [orders, users] = await Promise.all([listOrders(), listUsers()]);
  const overview = computeOverview(orders);
  const customers = computeCustomerSummaries(users, orders);
  const lowInventory = await getLowInventoryAlerts();

  const snapshot = JSON.stringify({
    overview,
    lowInventory,
    customers: customers.slice(0, 50),
    recentOrders: orders.slice(0, 30).map((o) => ({
      reference: o.reference,
      status: o.status,
      paymentMethod: o.paymentMethod,
      total: o.total,
      createdAt: o.createdAt,
      items: o.items.map((i) => ({ name: i.name, quantity: i.quantity })),
    })),
  });

  try {
    const answer = await askStoreAssistant(body.question, snapshot);
    return NextResponse.json({ answer });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "The assistant is unavailable." },
      { status: 503 }
    );
  }
}
