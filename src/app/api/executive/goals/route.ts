import { NextResponse } from "next/server";
import { requireExecutiveSession, requireCommandSession } from "@/lib/executive/require-auth";
import { listGoals, upsertGoal } from "@/lib/goals/store";
import { withApiErrorHandling } from "@/lib/api-error";
import { logActivity } from "@/lib/activity-log";
import { getCurrentCustomer } from "@/lib/users/current-user";

export const dynamic = "force-dynamic";

export const GET = withApiErrorHandling(async () => {
  if (!(await requireExecutiveSession())) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  const goals = await listGoals();
  return NextResponse.json({ goals });
});

// Setting targets is a command-only action; /office views them read-only.
export const POST = withApiErrorHandling(async (request: Request) => {
  if (!(await requireCommandSession())) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  const body = await request.json();
  if (!body.period?.trim() || !body.periodType || !(body.targetUsd >= 0)) {
    return NextResponse.json({ error: "period, periodType, and a non-negative targetUsd are required." }, { status: 400 });
  }
  const goal = await upsertGoal({ period: body.period, periodType: body.periodType, targetUsd: Number(body.targetUsd) });

  const actor = await getCurrentCustomer();
  if (actor) await logActivity(actor.email, "goal.set", `${goal.period}: $${goal.targetUsd.toFixed(2)}`);

  return NextResponse.json({ goal });
});
