import { NextResponse } from "next/server";
import { requireCommandSession } from "@/lib/executive/require-auth";
import { getAffiliateById, listPayouts, recordPayout } from "@/lib/affiliates";
import { affiliatePayoutSchema, parseBody } from "@/lib/validation";
import { withApiErrorHandling } from "@/lib/api-error";
import { logActivity } from "@/lib/activity-log";
import { getCurrentCustomer } from "@/lib/users/current-user";
import { getUserByEmail } from "@/lib/users/store";
import { sendAffiliateCommissionPaidEmail } from "@/lib/email";
import { sendCommissionPaidSms } from "@/lib/sms";

export const dynamic = "force-dynamic";

export const GET = withApiErrorHandling(async (
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) => {
  if (!(await requireCommandSession())) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { id } = await params;
  const payouts = await listPayouts(id);
  return NextResponse.json({ payouts });
});

export const POST = withApiErrorHandling(async (
  request: Request,
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

  const parsed = await parseBody(request, affiliatePayoutSchema);
  if ("error" in parsed) return parsed.error;

  const payout = await recordPayout({ affiliateId: id, ...parsed.data });

  await sendAffiliateCommissionPaidEmail(affiliate, parsed.data.amount).catch(() => {});
  const affiliateUser = await getUserByEmail(affiliate.email);
  if (affiliateUser?.smsOptIn && affiliateUser.phone) {
    await sendCommissionPaidSms(affiliateUser.phone, parsed.data.amount).catch(() => {});
  }

  const actor = await getCurrentCustomer();
  if (actor) {
    await logActivity(actor.email, "affiliate.payout_recorded", `${affiliate.name} — $${parsed.data.amount.toFixed(2)}`);
  }

  return NextResponse.json({ payout });
});
