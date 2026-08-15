import { NextResponse } from "next/server";
import { requireExecutiveSession } from "@/lib/executive/require-auth";
import { listOrders } from "@/lib/orders/store";
import { computeOverview } from "@/lib/executive/stats";
import { getLowInventoryAlerts } from "@/lib/inventory";
import { listProducts } from "@/lib/products";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await requireExecutiveSession())) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const [orders, products] = await Promise.all([listOrders(), listProducts()]);
  const overview = computeOverview(orders, products);
  const lowInventory = await getLowInventoryAlerts();

  return NextResponse.json({ overview, lowInventory });
}
