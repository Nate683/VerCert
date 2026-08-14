import type { Order, OrderStatus } from "@/lib/types";
import { updateOrder } from "./store";
import { decrementStock, restoreStock } from "@/lib/inventory";
import { sendPaymentConfirmedEmail, sendShippingNotificationEmail } from "@/lib/email";

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
  }
  return updated;
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

  return updateOrder(order.id, {
    status: "cancelled",
    cancelledAt: new Date().toISOString(),
    cancelReason: reason,
    stockDecremented: false,
  });
}
