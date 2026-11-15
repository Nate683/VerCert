import { NextResponse } from "next/server";
import { requireExecutiveSession } from "@/lib/executive/require-auth";
import { getStrengthStock, InventoryError, setLowStockThreshold } from "@/lib/inventory";
import { lowStockThresholdSchema, parseBody } from "@/lib/validation";
import { withApiErrorHandling } from "@/lib/api-error";
import { logActivity } from "@/lib/activity-log";
import { getCurrentCustomer } from "@/lib/users/current-user";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ strengthId: string }> };

// Sets one strength's low-stock threshold, recorded in its movement history. Staff only. Changes no quantity and
// no storefront availability.
export const PUT = withApiErrorHandling(async (request: Request, { params }: Params) => {
  if (!(await requireExecutiveSession())) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  const { strengthId } = await params;
  const parsed = await parseBody(request, lowStockThresholdSchema);
  if ("error" in parsed) return parsed.error;
  const actor = await getCurrentCustomer();
  try {
    const movement = await setLowStockThreshold({ strengthId, ...parsed.data, note: parsed.data.note || null, actor: actor?.email ?? "executive" });
    if (actor) await logActivity(actor.email, "inventory.threshold", `${movement.sku}: ${movement.reason}`);
    return NextResponse.json({ movement, row: await getStrengthStock(strengthId) });
  } catch (err) {
    if (err instanceof InventoryError) return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
    throw err;
  }
});
