import { NextResponse } from "next/server";
import { requireExecutiveSession } from "@/lib/executive/require-auth";
import { listOwnerTransactions, createOwnerTransaction } from "@/lib/ledger";
import { ownerTransactionSchema, parseBody } from "@/lib/validation";
import { withApiErrorHandling } from "@/lib/api-error";
import { logActivity } from "@/lib/activity-log";
import { getCurrentCustomer } from "@/lib/users/current-user";

export const dynamic = "force-dynamic";

export const GET = withApiErrorHandling(async () => {
  if (!(await requireExecutiveSession())) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  const transactions = await listOwnerTransactions();
  return NextResponse.json({ transactions });
});

export const POST = withApiErrorHandling(async (request: Request) => {
  const actor = await getCurrentCustomer();
  if (!actor || (actor.role !== "command" && actor.role !== "office")) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const parsed = await parseBody(request, ownerTransactionSchema);
  if ("error" in parsed) return parsed.error;

  const transaction = await createOwnerTransaction(parsed.data);
  await logActivity(actor.email, `owner.${transaction.type}`, `$${transaction.amountUsd.toFixed(2)}`);
  return NextResponse.json({ transaction });
});
