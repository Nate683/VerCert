import { NextResponse } from "next/server";
import { requireCommandSession } from "@/lib/executive/require-auth";
import { listPromoCodesWithStats, createPromoCode, getPromoCodeByCode } from "@/lib/promotions";
import { promoCodeSchema, parseBody } from "@/lib/validation";
import { withApiErrorHandling } from "@/lib/api-error";

export const dynamic = "force-dynamic";

// Promotions are /command-only — /office never sees or can call this.
export const GET = withApiErrorHandling(async () => {
  if (!(await requireCommandSession())) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const promoCodes = await listPromoCodesWithStats();
  return NextResponse.json({ promoCodes });
});

export const POST = withApiErrorHandling(async (request: Request) => {
  if (!(await requireCommandSession())) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const parsed = await parseBody(request, promoCodeSchema);
  if ("error" in parsed) return parsed.error;

  if (await getPromoCodeByCode(parsed.data.code)) {
    return NextResponse.json({ error: "A promo code with this code already exists." }, { status: 409 });
  }

  const promoCode = await createPromoCode(parsed.data);
  return NextResponse.json({ promoCode });
});
