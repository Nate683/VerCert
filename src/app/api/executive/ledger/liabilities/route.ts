import { NextResponse } from "next/server";
import { requireExecutiveSession } from "@/lib/executive/require-auth";
import { listLiabilities, createLiability } from "@/lib/ledger";
import { ledgerLiabilitySchema, parseBody } from "@/lib/validation";
import { withApiErrorHandling } from "@/lib/api-error";
import { logActivity } from "@/lib/activity-log";
import { getCurrentCustomer } from "@/lib/users/current-user";

export const dynamic = "force-dynamic";

export const GET = withApiErrorHandling(async () => {
  if (!(await requireExecutiveSession())) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  const liabilities = await listLiabilities();
  return NextResponse.json({ liabilities });
});

export const POST = withApiErrorHandling(async (request: Request) => {
  const actor = await getCurrentCustomer();
  if (!actor || (actor.role !== "command" && actor.role !== "office")) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const parsed = await parseBody(request, ledgerLiabilitySchema);
  if ("error" in parsed) return parsed.error;

  const liability = await createLiability(parsed.data);
  await logActivity(actor.email, "liability.created", `${liability.name} — $${liability.valueUsd.toFixed(2)}`);
  return NextResponse.json({ liability });
});
