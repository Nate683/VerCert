import { NextResponse } from "next/server";
import { requireExecutiveSession } from "@/lib/executive/require-auth";
import { getOrderDetail } from "@/lib/orders/lifecycle";
import { listMovements } from "@/lib/inventory";
import { withApiErrorHandling } from "@/lib/api-error";
import { noStore, notFound, unauthorized } from "@/lib/executive/route-helpers";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

// One order: customer and shipping details, lines, payment record, the lots it was reserved/filled from, returns,
// every inventory movement it caused, and its full activity history. Staff only.
export const GET = withApiErrorHandling(async (_request: Request, { params }: Params) => {
  if (!(await requireExecutiveSession())) return unauthorized();
  const { id } = await params;
  const detail = await getOrderDetail(id);
  if (!detail) return notFound();
  const movements = await listMovements({ orderId: id, limit: 500 });
  return NextResponse.json({ ...detail, movements }, noStore);
});
