import { NextResponse } from "next/server";
import { listProducts, resolveUnitPrice } from "@/lib/products";
import { validatePromoCode } from "@/lib/promotions";
import { getCurrentCustomer } from "@/lib/users/current-user";
import { promoValidateSchema, parseBody } from "@/lib/validation";
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rate-limit";
import { withApiErrorHandling } from "@/lib/api-error";

export const dynamic = "force-dynamic";

// Public checkout-preview endpoint — lets the cart page show a discount
// before the order is placed. This is a preview only: /api/orders always
// re-validates and re-computes the discount itself before charging anything.
export const POST = withApiErrorHandling(async (request: Request) => {
  const ip = getClientIp(request);
  const limit = await checkRateLimit(`promo-validate:${ip}`, { limit: 30, windowMs: 60 * 1000 });
  if (!limit.allowed) return rateLimitResponse(limit.retryAfterSeconds);

  const parsed = await parseBody(request, promoValidateSchema);
  if ("error" in parsed) return parsed.error;
  const { code, items } = parsed.data;

  const products = await listProducts();
  const lineItems: { slug: string; category: string; lineTotal: number }[] = [];
  let subtotal = 0;
  for (const item of items) {
    const product = products.find((p) => p.slug === item.slug);
    const size = product?.sizes.find((s) => s.label === item.sizeLabel);
    if (!product || !size) {
      return NextResponse.json({ error: `Invalid cart item: ${item.slug}` }, { status: 400 });
    }
    const lineTotal = resolveUnitPrice(size, item.quantity) * item.quantity;
    subtotal += lineTotal;
    lineItems.push({ slug: product.slug, category: product.category, lineTotal });
  }

  const customer = await getCurrentCustomer();
  const result = await validatePromoCode({
    code,
    subtotal,
    lineItems,
    customerId: customer?.id,
  });

  if (!result.ok) {
    return NextResponse.json({ valid: false, message: result.message });
  }

  return NextResponse.json({
    valid: true,
    discountAmount: result.discountAmount,
    freeShipping: result.freeShipping,
    type: result.promo.type,
    code: result.promo.code,
  });
});
