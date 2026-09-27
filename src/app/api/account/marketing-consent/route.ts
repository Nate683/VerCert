import { NextResponse } from "next/server";
import { getCurrentCustomer } from "@/lib/users/current-user";
import { setMarketingConsent } from "@/lib/users/store";
import { withApiErrorHandling } from "@/lib/api-error";

export const dynamic = "force-dynamic";

export const POST = withApiErrorHandling(async (request: Request) => {
  const user = await getCurrentCustomer();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  let body: { marketingConsent?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (typeof body.marketingConsent !== "boolean") {
    return NextResponse.json({ error: "marketingConsent must be true or false." }, { status: 400 });
  }

  const updated = await setMarketingConsent(user.id, body.marketingConsent, "account_settings");
  return NextResponse.json({
    marketingConsent: updated?.marketingConsent ?? body.marketingConsent,
    marketingConsentAt: updated?.marketingConsentAt ?? null,
  });
});
