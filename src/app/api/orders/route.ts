import { NextResponse } from "next/server";
import { products } from "@/lib/products";
import { createOrder, updateOrder } from "@/lib/orders/store";
import { getPaymentProvider, PaymentProviderError } from "@/lib/payments";
import { sendOrderConfirmationEmail } from "@/lib/email";
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
  const { customer, items, paymentMethod } = parsed.data;

  // Recompute pricing server-side from the product catalog — never trust client-sent prices.
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
      priceUsd: size.priceUsd,
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
  const total = subtotal;

  const order = await createOrder({
    paymentMethod,
    customerId: currentCustomer.id,
    customer,
    items: resolvedItems,
    subtotal,
    total,
    status: "awaiting_payment",
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

  return NextResponse.json({ reference: order.reference });
});
