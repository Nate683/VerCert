import { NextResponse } from "next/server";
import { requireCommandSession } from "@/lib/executive/require-auth";
import { deleteGoal } from "@/lib/goals/store";
import { withApiErrorHandling } from "@/lib/api-error";

export const dynamic = "force-dynamic";

export const DELETE = withApiErrorHandling(async (
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) => {
  if (!(await requireCommandSession())) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  const { id } = await params;
  await deleteGoal(id);
  return NextResponse.json({ ok: true });
});
