import { NextResponse } from "next/server";
import { requireCommandSession } from "@/lib/executive/require-auth";
import { listInviteCodes, getTierInfo } from "@/lib/affiliates";
import { sendInviteCodeEmail } from "@/lib/email";
import { withApiErrorHandling } from "@/lib/api-error";
import { logActivity } from "@/lib/activity-log";
import { getCurrentCustomer } from "@/lib/users/current-user";

export const dynamic = "force-dynamic";

export const POST = withApiErrorHandling(async (
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) => {
  if (!(await requireCommandSession())) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { id } = await params;
  const code = (await listInviteCodes()).find((c) => c.id === id);
  if (!code) return NextResponse.json({ error: "Invite code not found." }, { status: 404 });
  if (code.usedAt) return NextResponse.json({ error: "This code has already been used." }, { status: 400 });
  if (!code.boundEmail) {
    return NextResponse.json({ error: "This code isn't bound to an email address." }, { status: 400 });
  }

  const tierInfo = getTierInfo(code.tier);
  await sendInviteCodeEmail({ email: code.boundEmail, code: code.code, tierLabel: tierInfo?.label ?? code.tier });

  const actor = await getCurrentCustomer();
  if (actor) await logActivity(actor.email, "invite_code.resent", code.code);

  return NextResponse.json({ ok: true });
});
