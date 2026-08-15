import { NextResponse } from "next/server";
import { requireCommandSession } from "@/lib/executive/require-auth";
import { getAffiliateById, updateAffiliate, deleteAffiliate } from "@/lib/affiliates";
import { updatePromoCode } from "@/lib/promotions";
import { affiliateUpdateSchema, parseBody } from "@/lib/validation";
import { withApiErrorHandling } from "@/lib/api-error";
import { logActivity } from "@/lib/activity-log";
import { getCurrentCustomer } from "@/lib/users/current-user";

export const dynamic = "force-dynamic";

export const PATCH = withApiErrorHandling(async (
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) => {
  if (!(await requireCommandSession())) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { id } = await params;
  const existing = await getAffiliateById(id);
  if (!existing) {
    return NextResponse.json({ error: "Affiliate not found." }, { status: 404 });
  }

  const parsed = await parseBody(request, affiliateUpdateSchema);
  if ("error" in parsed) return parsed.error;

  const affiliate = await updateAffiliate(id, parsed.data);
  // Keep the affiliate active/inactive in sync with their promo code so a
  // deactivated affiliate can't still be used at checkout.
  if (affiliate?.promoCodeId && parsed.data.active !== undefined) {
    await updatePromoCode(affiliate.promoCodeId, { active: parsed.data.active });
  }

  const actor = await getCurrentCustomer();
  if (actor) await logActivity(actor.email, "affiliate.updated", affiliate?.name);

  return NextResponse.json({ affiliate });
});

export const DELETE = withApiErrorHandling(async (
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) => {
  if (!(await requireCommandSession())) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { id } = await params;
  const affiliate = await getAffiliateById(id);
  await deleteAffiliate(id);

  const actor = await getCurrentCustomer();
  if (actor) await logActivity(actor.email, "affiliate.deleted", affiliate?.name);

  return NextResponse.json({ ok: true });
});
