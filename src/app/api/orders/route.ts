import { NextResponse } from "next/server";
import { listProducts, resolveUnitPrice } from "@/lib/products";
import { createOrder, updateOrder } from "@/lib/orders/store";
import { validatePromoCode } from "@/lib/promotions";
import { getPaymentProvider, PaymentProviderError } from "@/lib/payments";
import { sendOrderConfirmationEmail, sendAdminNotification } from "@/lib/email";
import { getContent, DEFAULT_NOTIFICATION_SETTINGS } from "@/lib/site-content";
import { getCurrentCustomer } from "@/lib/users/current-user";
import { updateUser } from "@/lib/users/store";
import { findInsufficientStock } from "@/lib/inventory";
import type { CartItem } from "@/lib/types";
import { createOrderSchema, parseBody } from "@/lib/validation";
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rate-limit";
import { withApiErrorHandling } from "@/lib/api-error";

export const dynamic = "force-dynamic";

export const POST = withApiErrorHandling(async (request: Request) => {
  const currentCustomer = await getCurrentCustomer();
  if (!currentCustomer) {
    return NextResponse.json(
      { error: "Please sign in to complete your purchase." },
      { status: 401 }
    );
  }

  const ip = getClientIp(request);
  const limit = await checkRateLimit(`orders:${currentCustomer.id}:${ip}`, {
    limit: 20,
    windowMs: 60 * 60 * 1000,
  });
  if (!limit.allowed) return rateLimitResponse(limit.retryAfterSeconds);

  const parsed = await parseBody(request, createOrderSchema);
  if ("error" in parsed) return parsed.error;
  const { customer, items, paymentMethod, promoCode } = parsed.data;

  // Recompute pricing server-side from the product catalog — never trust client-sent prices.
  const products = await listProducts();
  const resolvedItems: CartItem[] = [];
  for (const item of items) {
    const product = products.find((p) => p.slug === item.slug);
    const size = product?.sizes.find((s) => s.label === item.sizeLabel);
    if (!product || !size) {
      return NextResponse.json({ error: `Invalid cart item: ${item.slug}` }, { status: 400 });
    }
    resolvedItems.push({
      slug: product.slug,
      name: product.name,
      sizeLabel: size.label,
      priceUsd: resolveUnitPrice(size, item.quantity),
      quantity: item.quantity,
    });
  }

  const shortages = await findInsufficientStock(resolvedItems);
  if (shortages.length > 0) {
    return NextResponse.json(
      { error: `Not enough stock for: ${shortages.join(", ")}. Please adjust your cart.` },
      { status: 409 }
    );
  }

  const subtotal = resolvedItems.reduce((sum, i) => sum + i.priceUsd * i.quantity, 0);

  let discountAmount = 0;
  let freeShipping = false;
  let appliedPromoCode: string | undefined;
  let appliedPromoCodeId: string | undefined;
  if (promoCode) {
    const lineItems = resolvedItems.map((item) => {
      const product = products.find((p) => p.slug === item.slug);
      return { slug: item.slug, category: product?.category ?? "", lineTotal: item.priceUsd * item.quantity };
    });
    const result = await validatePromoCode({
      code: promoCode,
      subtotal,
      lineItems,
      customerId: currentCustomer.id,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.message }, { status: 400 });
    }
    discountAmount = result.discountAmount;
    freeShipping = result.freeShipping;
    appliedPromoCode = result.promo.code;
    appliedPromoCodeId = result.promo.id;
  }

  const total = Math.max(0, subtotal - discountAmount);

  const order = await createOrder({
    paymentMethod,
    customerId: currentCustomer.id,
    customer,
    items: resolvedItems,
    subtotal,
    total,
    status: "awaiting_payment",
    promoCode: appliedPromoCode,
    promoCodeId: appliedPromoCodeId,
    discountAmount,
    freeShipping,
  });

  // Remember the shipping address used for next time.
  await updateUser(currentCustomer.id, {
    savedAddress: {
      address: customer.address,
      city: customer.city,
      state: customer.state,
      postalCode: customer.postalCode,
      country: customer.country,
    },
  });

  const provider = getPaymentProvider(paymentMethod);
  try {
    const patch = await provider.initiate(order);
    if (Object.keys(patch).length > 0) await updateOrder(order.id, patch);
  } catch (err) {
    if (err instanceof PaymentProviderError) {
      return NextResponse.json({ error: err.message, reference: order.reference }, { status: 503 });
    }
    console.error(`Unexpected error initiating payment for order ${order.reference}:`, err);
    return NextResponse.json(
      {
        error: `Something went wrong setting up payment. Your order ${order.reference} was saved — please contact support.`,
        reference: order.reference,
      },
      { status: 500 }
    );
  }

  try {
    await sendOrderConfirmationEmail(order);
  } catch (err) {
    console.error("Failed to send order confirmation email:", err);
  }

  try {
    const settings = await getContent("notification_settings", DEFAULT_NOTIFICATION_SETTINGS);
    if (settings.notifyNewOrder) {
      await sendAdminNotification(
        settings.emailAddress,
        `New Order ${order.reference}`,
        `A new order was placed.\n\nReference: ${order.reference}\nTotal: $${order.total.toFixed(2)}\nPayment method: ${order.paymentMethod}\nCustomer: ${order.customer.firstName} ${order.customer.lastName} (${order.customer.email})`
      );
    }
  } catch (err) {
    console.error("Failed to send new-order admin notification:", err);
  }

  return NextResponse.json({ reference: order.reference });
});
