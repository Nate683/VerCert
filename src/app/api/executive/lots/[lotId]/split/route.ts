import { NextResponse } from "next/server";
import { requireExecutiveActor } from "@/lib/executive/require-auth";
import { getLot, splitLot } from "@/lib/inventory";
import { lotSplitSchema, parseBody } from "@/lib/validation";
import { withApiErrorHandling } from "@/lib/api-error";
import { logActivity } from "@/lib/activity-log";
import { inventoryErrorResponse, unauthorized } from "@/lib/executive/route-helpers";

export const dynamic = "force-dynamic";

// Moves units from this lot into a new lot with real batch details — how the quarantined reconciliation lot
// (RECON-<SKU>, owner decision A1) is turned into traceable lots. The SKU total does not change; the new lot starts
// pending/untested (not sellable). Both sides are recorded movements.
export const POST = withApiErrorHandling(async (request: Request, { params }: { params: Promise<{ lotId: string }> }) => {
  const actor = await requireExecutiveActor();
  if (!actor) return unauthorized();
  const { lotId } = await params;
  const parsed = await parseBody(request, lotSplitSchema);
  if ("error" in parsed) return parsed.error;
  const from = await getLot(lotId);
  if (!from) return NextResponse.json({ error: "Lot not found." }, { status: 404 });
  try {
    const r = await splitLot({ fromLotId: lotId, ...parsed.data, actor: actor.email, idempotencyKey: `admin:${parsed.data.idempotencyKey}` });
    await logActivity(actor.email, "inventory.lot_split", `${from.lotCode} → ${r.lot_code ?? r.lot_id}: ${parsed.data.quantity} unit(s) — ${parsed.data.reason}`);
    return NextResponse.json({ result: r, lot: await getLot(r.lot_id) });
  } catch (err) {
    return inventoryErrorResponse(err);
  }
});
