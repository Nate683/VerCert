import { NextResponse } from "next/server";
import { requireCommandSession } from "@/lib/executive/require-auth";
import { getAffiliateById, regeneratePortalCode } from "@/lib/affiliates";
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
  const existing = await getAffiliateById(id);
  if (!existing) {
    return NextResponse.json({ error: "Affiliate not found." }, { status: 404 });
  }

  const affiliate = await regeneratePortalCode(id);

  const actor = await getCurrentCustomer();
  if (actor) await logActivity(actor.email, "affiliate.portal_code_regenerated", affiliate?.name);

  return NextResponse.json({ affiliate });
});
