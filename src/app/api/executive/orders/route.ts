import { NextResponse } from "next/server";
import { requireExecutiveSession } from "@/lib/executive/require-auth";
import { searchOrders } from "@/lib/orders/store";
import { withApiErrorHandling } from "@/lib/api-error";
import { noStore, unauthorized } from "@/lib/executive/route-helpers";

export const dynamic = "force-dynamic";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const STATUS_WORD = /^[a-z_]{2,30}$/;

// Executive Office → Orders. Search by order number, customer name, email or SKU; filter by payment status,
// fulfillment status, method, legacy status, review flag and date range. Staff only.
export const GET = withApiErrorHandling(async (request: Request) => {
  if (!(await requireExecutiveSession())) return unauthorized();
  const sp = new URL(request.url).searchParams;
  const word = (k: string) => {
    const v = sp.get(k);
    return v && STATUS_WORD.test(v) ? v : undefined;
  };
  const date = (k: string) => {
    const v = sp.get(k);
    return v && DATE.test(v) ? v : undefined;
  };
  const orders = await searchOrders({
    search: sp.get("search")?.trim().slice(0, 100) || undefined,
    paymentStatus: word("paymentStatus"),
    fulfillmentStatus: word("fulfillmentStatus"),
    paymentMethod: word("paymentMethod"),
    status: word("status"),
    needsReview: sp.get("review") === "1",
    from: date("from"),
    to: date("to"),
  });
  return NextResponse.json({ orders }, noStore);
});
