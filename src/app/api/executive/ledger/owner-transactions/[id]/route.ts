import { NextResponse } from "next/server";
import { deleteOwnerTransaction } from "@/lib/ledger";
import { withApiErrorHandling } from "@/lib/api-error";
import { logActivity } from "@/lib/activity-log";
import { getCurrentCustomer } from "@/lib/users/current-user";

export const dynamic = "force-dynamic";

export const DELETE = withApiErrorHandling(async (
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) => {
  const actor = await getCurrentCustomer();
  if (!actor || (actor.role !== "command" && actor.role !== "office")) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { id } = await params;
  await deleteOwnerTransaction(id);
  await logActivity(actor.email, "owner_transaction.deleted", id);
  return NextResponse.json({ ok: true });
});
