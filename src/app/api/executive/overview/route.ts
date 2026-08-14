import { NextResponse } from "next/server";
import { requireExecutiveSession } from "@/lib/executive/require-auth";
import { listOrders } from "@/lib/orders/store";
import { computeOverview } from "@/lib/executive/stats";
import { getLowInventoryAlerts } from "@/lib/inventory";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await requireExecutiveSession())) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const orders = await listOrders();
  const overview = computeOverview(orders);
  const lowInventory = getLowInventoryAlerts();

  return NextResponse.json({ overview, lowInventory });
}
