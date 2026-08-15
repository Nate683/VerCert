import { NextResponse } from "next/server";
import { requireCommandSession } from "@/lib/executive/require-auth";
import { getAffiliateById } from "@/lib/affiliates";
import { sendAffiliateInviteEmail } from "@/lib/email";
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
  const affiliate = await getAffiliateById(id);
  if (!affiliate) {
    return NextResponse.json({ error: "Affiliate not found." }, { status: 404 });
  }

  await sendAffiliateInviteEmail(affiliate);

  const actor = await getCurrentCustomer();
  if (actor) await logActivity(actor.email, "affiliate.invite_resent", affiliate.name);

  return NextResponse.json({ ok: true });
});
