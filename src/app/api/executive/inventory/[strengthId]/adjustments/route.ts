import { NextResponse } from "next/server";
import { requireExecutiveActor } from "@/lib/executive/require-auth";
import { adjustStock, getLot, getStrengthStock } from "@/lib/inventory";
import { inventoryAdjustmentSchema, parseBody } from "@/lib/validation";
import { withApiErrorHandling } from "@/lib/api-error";
import { logActivity } from "@/lib/activity-log";
import { inventoryErrorResponse, unauthorized } from "@/lib/executive/route-helpers";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ strengthId: string }> };

// Records a stock adjustment (add, remove, correct count) to ONE LOT of a strength (Stage 3: the SKU total moves with
// the lot, in one database call). Staff only; validated here (types, whole units, reason from the list, note for
// "Other", idempotency key, lot belongs to this strength); the database enforces the bounds and the expected
// version of a count. Answers with the recorded movement and the new stock.
export const POST = withApiErrorHandling(async (request: Request, { params }: Params) => {
  const actor = await requireExecutiveActor();
  if (!actor) return unauthorized();
  const { strengthId } = await params;
  const parsed = await parseBody(request, inventoryAdjustmentSchema);
  if ("error" in parsed) return parsed.error;
  const lot = await getLot(parsed.data.lotId);
  if (!lot || lot.strengthId !== strengthId) return NextResponse.json({ error: "That lot isn't one of this strength's lots." }, { status: 400 });
  try {
    const movement = await adjustStock({ ...parsed.data, note: parsed.data.note || null, actor: actor.email });
    await logActivity(actor.email, "inventory.adjusted", `${movement.sku} lot ${lot.lotCode}: ${movement.previous} → ${movement.resulting} (${parsed.data.reason})`);
    return NextResponse.json({ movement, row: await getStrengthStock(strengthId) });
  } catch (err) {
    return inventoryErrorResponse(err);
  }
});
