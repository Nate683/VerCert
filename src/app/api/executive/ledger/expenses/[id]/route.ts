import { NextResponse } from "next/server";
import { updateExpense, deleteExpense } from "@/lib/ledger";
import { expenseUpdateSchema, parseBody } from "@/lib/validation";
import { withApiErrorHandling } from "@/lib/api-error";
import { logActivity } from "@/lib/activity-log";
import { getCurrentCustomer } from "@/lib/users/current-user";

export const dynamic = "force-dynamic";

export const PATCH = withApiErrorHandling(async (
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) => {
  const actor = await getCurrentCustomer();
  if (!actor || (actor.role !== "command" && actor.role !== "office")) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { id } = await params;
  const parsed = await parseBody(request, expenseUpdateSchema);
  if ("error" in parsed) return parsed.error;

  const expense = await updateExpense(id, parsed.data);
  await logActivity(actor.email, "expense.updated", id);
  return NextResponse.json({ expense });
});

export const DELETE = withApiErrorHandling(async (
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) => {
  const actor = await getCurrentCustomer();
  if (!actor || (actor.role !== "command" && actor.role !== "office")) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { id } = await params;
  await deleteExpense(id);
  await logActivity(actor.email, "expense.deleted", id);
  return NextResponse.json({ ok: true });
});
