import { getProductBySlug, isOnSale, pricedSizes, resolveUnitPrice } from "@/lib/products";
import { createOrder } from "@/lib/orders/store";
import { RESEARCH_ATTESTATION } from "@/lib/orders/attestation";
import { findInsufficientStock } from "@/lib/inventory";
import { sendOrderConfirmationEmail, sendTransactionalEmail, sendAdminNotification } from "@/lib/email";
import { getContent, DEFAULT_NOTIFICATION_SETTINGS } from "@/lib/site-content";
import { getSiteUrl } from "@/lib/site-url";
import { logActivity } from "@/lib/activity-log";
import type { CartItem } from "@/lib/types";
import { isSubscribable, subscriptionUnitPrice, intervalLabel } from "./rules";
import { addDays, listDueSubscriptions, updateSubscription, type Subscription } from "./store";

const ACTOR = "system:subscriptions";

export type RunResult = { reference?: string; subscriptionId: string; outcome: "ordered" | "waiting_for_stock" | "paused" };

// Places the order for every active subscription that's due. Payment is
// manual, so each run creates an ordinary order awaiting payment and emails
// the bank transfer instructions with its reference code; nothing is charged
// automatically. Recurring orders are always bank transfer: a crypto charge
// expires within the hour, long before the customer opens the email.
//
// - Out of stock: nothing is ordered and the due date isn't moved, so the
//   next daily run tries again; the reason is shown to customer and staff.
// - Product withdrawn (inactive, unpriced, or now a blend): paused, and the
//   customer is told.
export async function runDueSubscriptions(now = new Date()): Promise<RunResult[]> {
  const due = await listDueSubscriptions(now.toISOString());
  const results: RunResult[] = [];
  for (const sub of due) {
    try {
      results.push(await runOne(sub, now));
    } catch (err) {
      console.error(`[subscriptions] run failed for ${sub.id}:`, err);
    }
  }
  return results;
}

async function runOne(sub: Subscription, now: Date): Promise<RunResult> {
  const product = await getProductBySlug(sub.productSlug);
  const size = product && pricedSizes(product).find((s) => s.label === sub.sizeLabel);

  if (!product || !size || !isOnSale(product) || !isSubscribable(product)) {
    const name = product?.name ?? sub.productSlug;
    const reason = `${name} ${sub.sizeLabel} is no longer available.`;
    await updateSubscription(sub.id, { status: "paused", statusReason: reason });
    await sendTransactionalEmail(
      sub.customer.email,
      `Your VeriCert subscription is paused`,
      [
        `Hi ${sub.customer.firstName},`,
        "",
        `${reason} We've paused your subscription (${intervalLabel(sub.intervalDays)}) and no order has been placed.`,
        `You can see or cancel it from your account: ${getSiteUrl()}/account`,
        "",
        "— VeriCert Research",
      ].join("\n")
    ).catch((err) => console.error("[subscriptions] pause email failed:", err));
    await logActivity(ACTOR, "subscription.paused", `${sub.id}: ${reason}`);
    return { subscriptionId: sub.id, outcome: "paused" };
  }

  const listPrice = resolveUnitPrice(size, sub.quantity);
  const line: CartItem = {
    slug: product.slug,
    name: product.name,
    sizeLabel: size.label,
    priceUsd: subscriptionUnitPrice(listPrice, sub.discountPercent),
    quantity: sub.quantity,
    lotNumber: product.batchNumbers[0],
    subscription: { intervalDays: sub.intervalDays, discountPercent: sub.discountPercent, listPriceUsd: listPrice },
  };

  if ((await findInsufficientStock([line])).length > 0) {
    const reason = "Waiting for stock — the order is placed as soon as it's back.";
    if (sub.statusReason !== reason) await updateSubscription(sub.id, { statusReason: reason });
    return { subscriptionId: sub.id, outcome: "waiting_for_stock" };
  }

  const total = line.priceUsd * line.quantity;
  const order = await createOrder({
    paymentMethod: "bank_transfer",
    customerId: sub.customerId,
    customer: sub.customer,
    items: [line],
    subtotal: total,
    total,
    status: "awaiting_payment",
    // Accepted when the customer subscribed, and it covers every delivery.
    researchAttestation: { text: RESEARCH_ATTESTATION, at: sub.createdAt },
    subscriptionId: sub.id,
  });

  // The next one is due one interval after this one was due, so a run that
  // waited for stock doesn't shift the schedule permanently earlier or later
  // than the customer chose — unless it's fallen a whole interval behind.
  let next = addDays(sub.nextOrderAt, sub.intervalDays);
  if (new Date(next) <= now) next = addDays(now.toISOString(), sub.intervalDays);
  await updateSubscription(sub.id, { nextOrderAt: next, lastOrderReference: order.reference, statusReason: undefined });

  await sendOrderConfirmationEmail(order).catch((err) => console.error("[subscriptions] confirmation email failed:", err));
  try {
    const settings = await getContent("notification_settings", DEFAULT_NOTIFICATION_SETTINGS);
    if (settings.notifyNewOrder) {
      await sendAdminNotification(
        settings.emailAddress,
        `New Subscription Order ${order.reference}`,
        `A subscription order was placed automatically.\n\nReference: ${order.reference}\nTotal: $${order.total.toFixed(2)}\nCustomer: ${order.customer.firstName} ${order.customer.lastName} (${order.customer.email})`
      );
    }
  } catch (err) {
    console.error("[subscriptions] admin notification failed:", err);
  }
  await logActivity(ACTOR, "subscription.ordered", `${sub.id} → ${order.reference}`);
  return { reference: order.reference, subscriptionId: sub.id, outcome: "ordered" };
}
