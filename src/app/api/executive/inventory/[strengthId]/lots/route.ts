import { NextResponse } from "next/server";
import { requireExecutiveActor } from "@/lib/executive/require-auth";
import { getStrengthStock, receiveLot } from "@/lib/inventory";
import { lotReceiveSchema, parseBody } from "@/lib/validation";
import { withApiErrorHandling } from "@/lib/api-error";
import { logActivity } from "@/lib/activity-log";
import { inventoryErrorResponse, unauthorized } from "@/lib/executive/route-helpers";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ strengthId: string }> };

// Receives stock as a NEW lot of this strength: pending and untested, so it is on hand but not sellable until an
// administrator approves it (never automatic). Staff only; one database call; a repeated submission is recorded once.
export const POST = withApiErrorHandling(async (request: Request, { params }: Params) => {
  const actor = await requireExecutiveActor();
  if (!actor) return unauthorized();
  const { strengthId } = await params;
  const parsed = await parseBody(request, lotReceiveSchema);
  if ("error" in parsed) return parsed.error;
  try {
    const r = await receiveLot({ strengthId, ...parsed.data, actor: actor.email, idempotencyKey: `admin:${parsed.data.idempotencyKey}` });
    await logActivity(actor.email, "inventory.lot_received", `${r.lot_code ?? r.lot_id}: ${parsed.data.quantity} unit(s)${parsed.data.manufacturerLot ? `, batch ${parsed.data.manufacturerLot}` : ""}`);
    return NextResponse.json({ result: r, row: await getStrengthStock(strengthId) });
  } catch (err) {
    return inventoryErrorResponse(err);
  }
});
