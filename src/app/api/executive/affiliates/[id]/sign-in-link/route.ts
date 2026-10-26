import { NextResponse } from "next/server";
import { requireCommandSession } from "@/lib/executive/require-auth";
import { getAffiliateById, createAffiliateSignInLink, SignInLinkError } from "@/lib/affiliates";
import { withApiErrorHandling } from "@/lib/api-error";
import { logActivity } from "@/lib/activity-log";
import { getCurrentCustomer } from "@/lib/users/current-user";

export const dynamic = "force-dynamic";

// A fresh single-use sign-in link for the affiliate, shown once in /command
// to copy or text. Making one cancels any earlier unused link.
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

  const actor = await getCurrentCustomer();
  try {
    const signInLink = await createAffiliateSignInLink(affiliate, actor?.email);
    if (actor) await logActivity(actor.email, "affiliate.sign_in_link_created", affiliate.name);
    return NextResponse.json({ signInLink });
  } catch (err) {
    if (err instanceof SignInLinkError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
});
