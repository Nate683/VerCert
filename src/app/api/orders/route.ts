import { NextResponse } from "next/server";
import { products } from "@/lib/products";
import { createOrder, updateOrder } from "@/lib/orders/store";
import { createCoinbaseCharge } from "@/lib/coinbase";
import { sendBankTransferEmail } from "@/lib/email";
import { getCurrentCustomer } from "@/lib/users/current-user";
import { updateUser } from "@/lib/users/store";
import type { CartItem, CustomerInfo, PaymentMethod } from "@/lib/types";

export const dynamic = "force-dynamic";

type OrderRequestBody = {
  customer: Partial<CustomerInfo>;
  items: { slug: string; sizeLabel: string; quantity: number }[];
  paymentMethod: PaymentMethod;
};

const REQUIRED_CUSTOMER_FIELDS: (keyof CustomerInfo)[] = [
  "firstName",
  "lastName",
  "email",
  "address",
  "city",
  "state",
  "postalCode",
  "country",
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  const currentCustomer = await getCurrentCustomer();
  if (!currentCustomer) {
    return NextResponse.json(
      { error: "Please sign in to complete your purchase." },
      { status: 401 }
    );
  }

  let body: OrderRequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { customer, items, paymentMethod } = body;

  if (paymentMethod !== "crypto" && paymentMethod !== "bank_transfer") {
    return NextResponse.json({ error: "Invalid payment method." }, { status: 400 });
  }

  for (const field of REQUIRED_CUSTOMER_FIELDS) {
    if (!customer?.[field] || typeof customer[field] !== "string" || !customer[field].trim()) {
      return NextResponse.json({ error: `Missing required field: ${field}` }, { status: 400 });
    }
  }
  if (!EMAIL_RE.test(customer!.email!.trim())) {
    return NextResponse.json({ error: "Invalid email address." }, { status: 400 });
  }

  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: "Cart is empty." }, { status: 400 });
  }

  // Recompute pricing server-side from the product catalog — never trust client-sent prices.
  const resolvedItems: CartItem[] = [];
  for (const item of items) {
    const product = products.find((p) => p.slug === item.slug);
    const size = product?.sizes.find((s) => s.label === item.sizeLabel);
    const quantity = Math.floor(Number(item.quantity));
    if (!product || !size || !Number.isFinite(quantity) || quantity < 1 || quantity > 999) {
      return NextResponse.json({ error: `Invalid cart item: ${item.slug}` }, { status: 400 });
    }
    resolvedItems.push({
      slug: product.slug,
      name: product.name,
      sizeLabel: size.label,
      priceUsd: size.priceUsd,
      quantity,
    });
  }

  const subtotal = resolvedItems.reduce((sum, i) => sum + i.priceUsd * i.quantity, 0);
  const total = subtotal;

  const sanitizedCustomer: CustomerInfo = {
    firstName: customer!.firstName!.trim().slice(0, 100),
    lastName: customer!.lastName!.trim().slice(0, 100),
    email: customer!.email!.trim().slice(0, 200),
    address: customer!.address!.trim().slice(0, 200),
    city: customer!.city!.trim().slice(0, 100),
    state: customer!.state!.trim().slice(0, 100),
    postalCode: customer!.postalCode!.trim().slice(0, 20),
    country: customer!.country!.trim().slice(0, 100),
  };

  const order = await createOrder({
    paymentMethod,
    customerId: currentCustomer.id,
    customer: sanitizedCustomer,
    items: resolvedItems,
    subtotal,
    total,
    status: "awaiting_payment",
  });

  // Remember the shipping address used for next time.
  await updateUser(currentCustomer.id, {
    savedAddress: {
      address: sanitizedCustomer.address,
      city: sanitizedCustomer.city,
      state: sanitizedCustomer.state,
      postalCode: sanitizedCustomer.postalCode,
      country: sanitizedCustomer.country,
    },
  });

  if (paymentMethod === "bank_transfer") {
    try {
      await sendBankTransferEmail(order);
    } catch (err) {
      console.error("Failed to send bank transfer confirmation email:", err);
    }
    return NextResponse.json({ reference: order.reference });
  }

  // Crypto: create the Coinbase Commerce charge and attach it to the order.
  try {
    const charge = await createCoinbaseCharge(order);
    await updateOrder(order.id, { crypto: charge });
  } catch (err) {
    console.error("Failed to create Coinbase Commerce charge:", err);
    return NextResponse.json(
      {
        error:
          "Crypto payments aren't configured yet. Set COINBASE_COMMERCE_API_KEY in .env.local.",
        reference: order.reference,
      },
      { status: 503 }
    );
  }

  return NextResponse.json({ reference: order.reference });
}
