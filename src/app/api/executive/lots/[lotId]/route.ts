import { NextResponse } from "next/server";
import { requireExecutiveActor } from "@/lib/executive/require-auth";
import { getLot, listMovements, updateLot } from "@/lib/inventory";
import { lotUpdateSchema, parseBody } from "@/lib/validation";
import { withApiErrorHandling } from "@/lib/api-error";
import { logActivity } from "@/lib/activity-log";
import { notifyLotHolds } from "@/lib/orders/lifecycle";
import { inventoryErrorResponse, noStore, notFound, unauthorized } from "@/lib/executive/route-helpers";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ lotId: string }> };

// One lot with its traceability history (every movement that touched it, including each order it was reserved for
// or shipped on).
export const GET = withApiErrorHandling(async (_request: Request, { params }: Params) => {
  if (!(await requireExecutiveActor())) return unauthorized();
  const { lotId } = await params;
  const lot = await getLot(lotId);
  if (!lot) return notFound("Lot");
  return NextResponse.json({ lot, movements: await listMovements({ lotId, limit: 500 }) }, noStore);
});

// Changes a lot's testing / release status or its descriptive details (batch numbers, dates, notes). Approving a lot
// that hasn't passed testing — or the reconciliation/returns lot — needs a written justification (enforced by the
// database). Nothing approves a lot automatically. Recorded as a movement with the administrator and reason.
export const PATCH = withApiErrorHandling(async (request: Request, { params }: Params) => {
  const actor = await requireExecutiveActor();
  if (!actor) return unauthorized();
  const { lotId } = await params;
  const parsed = await parseBody(request, lotUpdateSchema);
  if ("error" in parsed) return parsed.error;
  try {
    const r = await updateLot({ lotId, ...parsed.data, actor: actor.email, idempotencyKey: `admin:${parsed.data.idempotencyKey}` });
    if (r.outcome === "updated") await logActivity(actor.email, "inventory.lot_updated", `${lotId}: ${(r.changes ?? []).join("; ")}${parsed.data.reason ? ` — ${parsed.data.reason}` : ""}`);
    // D5: customers whose paid orders this put on hold are told (once) that payment was received and shipping is
    // held pending a check.
    const customersNotified = r.held_orders?.length ? await notifyLotHolds(r.held_orders) : 0;
    return NextResponse.json({ result: r, customersNotified, lot: await getLot(lotId) });
  } catch (err) {
    return inventoryErrorResponse(err);
  }
});
