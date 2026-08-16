import { NextResponse } from "next/server";
import { requireCommandSession } from "@/lib/executive/require-auth";
import { listInviteCodes, deleteInviteCode } from "@/lib/affiliates";
import { withApiErrorHandling } from "@/lib/api-error";
import { logActivity } from "@/lib/activity-log";
import { getCurrentCustomer } from "@/lib/users/current-user";

export const dynamic = "force-dynamic";

export const DELETE = withApiErrorHandling(async (
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) => {
  if (!(await requireCommandSession())) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { id } = await params;
  const existing = (await listInviteCodes()).find((c) => c.id === id);
  if (!existing) {
    return NextResponse.json({ error: "Invite code not found." }, { status: 404 });
  }
  if (existing.usedAt) {
    return NextResponse.json({ error: "This code has already been used and can't be revoked." }, { status: 400 });
  }

  await deleteInviteCode(id);

  const actor = await getCurrentCustomer();
  if (actor) await logActivity(actor.email, "invite_code.revoked", existing.code);

  return NextResponse.json({ ok: true });
});
