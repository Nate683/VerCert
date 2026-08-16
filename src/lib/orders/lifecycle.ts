import type { Order, OrderStatus, RefundReasonCode } from "@/lib/types";
import { updateOrder } from "./store";
import { decrementStock, restoreStock, getLowInventoryAlerts } from "@/lib/inventory";
import { recordRedemption, removeRedemptionForOrder } from "@/lib/promotions";
import { sendPaymentConfirmedEmail, sendShippingNotificationEmail, sendAdminNotification } from "@/lib/email";
import { sendPaymentReceivedSms, sendOrderShippedSms } from "@/lib/sms";
import { getUserById } from "@/lib/users/store";
import { getContent, DEFAULT_NOTIFICATION_SETTINGS } from "@/lib/site-content";

// Centralizes every order status transition so stock decrements/restocks and
// customer emails always happen together and exactly once, no matter which
// entry point (webhook, polling reconciliation, or the executive terminal)
// triggers the change.

// Marks an order paid: decrements stock (idempotent via stockDecremented) and
// emails the customer. Safe to call more than once for the same order.
export async function markOrderPaid(order: Order): Promise<Order | null> {
  if (order.status !== "awaiting_payment") return order;

  if (!order.stockDecremented) {
    await decrementStock(order.items);
  }

  const updated = await updateOrder(order.id, {
    status: "paid",
    paidAt: new Date().toISOString(),
    stockDecremented: true,
  });

  if (updated) {
    sendPaymentConfirmedEmail(updated).catch((err) =>
      console.error("Failed to send payment confirmation email:", err)
    );
    notifyOrderSms(updated, (phone) => sendPaymentReceivedSms(phone, updated.reference, updated.total)).catch((err) =>
      console.error("Failed to send payment received SMS:", err)
    );
    // Only counted against usage/per-customer limits once payment is confirmed.
    if (updated.promoCodeId) {
      await recordRedemption({
        promoCodeId: updated.promoCodeId,
        orderId: updated.id,
        customerId: updated.customerId,
        discountAmount: updated.discountAmount ?? 0,
      });
    }
    notifyLowStockIfNeeded().catch((err) =>
      console.error("Failed to send low-stock admin notification:", err)
    );
  }
  return updated;
}

const FORWARD_FLOW: OrderStatus[] = ["paid", "processing", "shipped", "delivered"];

export function canAdvanceTo(current: OrderStatus, next: OrderStatus): boolean {
  const currentIndex = FORWARD_FLOW.indexOf(current);
  const nextIndex = FORWARD_FLOW.indexOf(next);
  if (currentIndex === -1 || nextIndex === -1) return false;
  // Allow moving forward one or more steps, but never backward.
  return nextIndex > currentIndex;
}

export type AdvanceOptions = { carrier?: string; trackingNumber?: string };

// Advances an already-paid order to processing/shipped/delivered. Sends the
// shipping notification exactly when the order transitions into "shipped".
export async function advanceOrderStatus(
  order: Order,
  next: OrderStatus,
  opts: AdvanceOptions = {}
): Promise<Order | null> {
  if (!canAdvanceTo(order.status, next)) {
    throw new Error(`Cannot move order from "${order.status}" to "${next}".`);
  }

  const patch: Partial<Order> = { status: next };
  if (next === "processing") patch.processingAt = new Date().toISOString();
  if (next === "shipped") {
    patch.shippedAt = new Date().toISOString();
    if (opts.carrier) patch.carrier = opts.carrier;
    if (opts.trackingNumber) patch.trackingNumber = opts.trackingNumber;
  }
  if (next === "delivered") patch.deliveredAt = new Date().toISOString();

  const updated = await updateOrder(order.id, patch);

  if (updated && next === "shipped") {
    sendShippingNotificationEmail(updated).catch((err) =>
      console.error("Failed to send shipping notification email:", err)
    );
    notifyOrderSms(updated, (phone) => sendOrderShippedSms(phone, updated.reference)).catch((err) =>
      console.error("Failed to send shipping notification SMS:", err)
    );
  }
  return updated;
}

// Only ever texts a customer who explicitly opted in with a phone number.
async function notifyOrderSms(order: Order, send: (phone: string) => Promise<void>): Promise<void> {
  if (!order.customerId) return;
  const user = await getUserById(order.customerId);
  if (user?.smsOptIn && user.phone) await send(user.phone);
}

const CANCELLABLE_STATUSES: OrderStatus[] = ["awaiting_payment", "paid", "processing"];

// Cancels an order and restores any stock that had already been decremented.
export async function cancelOrder(order: Order, reason?: string): Promise<Order | null> {
  if (!CANCELLABLE_STATUSES.includes(order.status)) {
    throw new Error(`Order in status "${order.status}" can no longer be cancelled.`);
  }

  if (order.stockDecremented) {
    await restoreStock(order.items);
  }
  if (order.promoCodeId) {
    await removeRedemptionForOrder(order.id);
  }

  return updateOrder(order.id, {
    status: "cancelled",
    cancelledAt: new Date().toISOString(),
    cancelReason: reason,
    stockDecremented: false,
  });
}

// Refunds a paid order — distinct from cancellation, since a refund can
// happen after shipment/delivery. Restores any decremented stock and
// reverses the promo redemption (and therefore any affiliate commission,
// which is always computed live and excludes refunded orders).
export async function refundOrder(
  order: Order,
  reason: RefundReasonCode,
  opts: { amount?: number; note?: string } = {}
): Promise<Order | null> {
  if (!order.paidAt) {
    throw new Error("Only paid orders can be refunded.");
  }
  if (order.refundedAt) {
    throw new Error("This order has already been refunded.");
  }

  if (order.stockDecremented) {
    await restoreStock(order.items);
  }
  if (order.promoCodeId) {
    await removeRedemptionForOrder(order.id);
  }

  return updateOrder(order.id, {
    refundedAt: new Date().toISOString(),
    refundReason: reason,
    refundAmount: opts.amount ?? order.total,
    stockDecremented: false,
  });
}

// Best-effort: after stock moves, check whether anything crossed its
// reorder threshold and email the configured admin address if so.
async function notifyLowStockIfNeeded(): Promise<void> {
  const settings = await getContent("notification_settings", DEFAULT_NOTIFICATION_SETTINGS);
  if (!settings.notifyLowStock || !settings.emailAddress) return;

  const alerts = await getLowInventoryAlerts();
  if (alerts.length === 0) return;

  await sendAdminNotification(
    settings.emailAddress,
    "Low Stock Alert",
    `The following products are at or below their reorder threshold:\n\n${alerts
      .map((a) => `- ${a.name}: ${a.quantity} left`)
      .join("\n")}`
  );
}
