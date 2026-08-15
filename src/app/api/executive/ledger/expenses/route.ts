import { NextResponse } from "next/server";
import { requireExecutiveSession } from "@/lib/executive/require-auth";
import { listExpenses, createExpense } from "@/lib/ledger";
import { expenseSchema, parseBody } from "@/lib/validation";
import { withApiErrorHandling } from "@/lib/api-error";
import { logActivity } from "@/lib/activity-log";
import { getCurrentCustomer } from "@/lib/users/current-user";

export const dynamic = "force-dynamic";

export const GET = withApiErrorHandling(async () => {
  if (!(await requireExecutiveSession())) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  const expenses = await listExpenses();
  return NextResponse.json({ expenses });
});

export const POST = withApiErrorHandling(async (request: Request) => {
  const actor = await getCurrentCustomer();
  if (!actor || (actor.role !== "command" && actor.role !== "office")) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const parsed = await parseBody(request, expenseSchema);
  if ("error" in parsed) return parsed.error;

  const expense = await createExpense({ ...parsed.data, createdBy: actor.email });
  await logActivity(actor.email, "expense.created", `${expense.category} — $${expense.amount.toFixed(2)}`);
  return NextResponse.json({ expense });
});
