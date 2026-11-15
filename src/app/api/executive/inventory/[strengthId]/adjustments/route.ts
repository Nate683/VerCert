import { NextResponse } from "next/server";
import { requireExecutiveSession } from "@/lib/executive/require-auth";
import { adjustStock, getStrengthStock, InventoryError } from "@/lib/inventory";
import { inventoryAdjustmentSchema, parseBody } from "@/lib/validation";
import { withApiErrorHandling } from "@/lib/api-error";
import { logActivity } from "@/lib/activity-log";
import { getCurrentCustomer } from "@/lib/users/current-user";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ strengthId: string }> };

// Records a stock adjustment (add, remove, correct count) for one strength. Staff only; validated here (types,
// whole units, reason from the list, note for "Other", idempotency key); applied atomically by lib/inventory.ts
// (row lock + guard + movement in one statement). Answers with the recorded movement and the new stock.
export const POST = withApiErrorHandling(async (request: Request, { params }: Params) => {
  if (!(await requireExecutiveSession())) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  const { strengthId } = await params;
  const parsed = await parseBody(request, inventoryAdjustmentSchema);
  if ("error" in parsed) return parsed.error;
  const actor = await getCurrentCustomer();
  try {
    const movement = await adjustStock({ strengthId, ...parsed.data, note: parsed.data.note || null, actor: actor?.email ?? "executive" });
    if (actor) await logActivity(actor.email, "inventory.adjusted", `${movement.sku}: ${movement.previous} → ${movement.resulting} (${parsed.data.reason})`);
    return NextResponse.json({ movement, row: await getStrengthStock(strengthId) });
  } catch (err) {
    if (err instanceof InventoryError) return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
    throw err;
  }
});
