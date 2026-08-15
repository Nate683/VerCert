import { NextResponse } from "next/server";
import { requireCommandSession } from "@/lib/executive/require-auth";
import { getPromoCodeById, updatePromoCode, deletePromoCode } from "@/lib/promotions";
import { promoCodeUpdateSchema, parseBody } from "@/lib/validation";
import { withApiErrorHandling } from "@/lib/api-error";

export const dynamic = "force-dynamic";

export const PATCH = withApiErrorHandling(async (
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) => {
  if (!(await requireCommandSession())) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { id } = await params;
  if (!(await getPromoCodeById(id))) {
    return NextResponse.json({ error: "Promo code not found." }, { status: 404 });
  }

  const parsed = await parseBody(request, promoCodeUpdateSchema);
  if ("error" in parsed) return parsed.error;

  const promoCode = await updatePromoCode(id, parsed.data);
  return NextResponse.json({ promoCode });
});

export const DELETE = withApiErrorHandling(async (
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) => {
  if (!(await requireCommandSession())) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { id } = await params;
  await deletePromoCode(id);
  return NextResponse.json({ ok: true });
});
