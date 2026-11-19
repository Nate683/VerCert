import type { FulfillmentStatus, Order, RefundReasonCode } from "@/lib/types";
import { getOrderById } from "./store";
import { callDb, getLowInventoryAlerts, InventoryError } from "@/lib/inventory";
import { transaction, query } from "@/lib/db";
import { recordRedemption, removeRedemptionForOrder } from "@/lib/promotions";
import { sendPaymentConfirmedEmail, sendPaymentHoldEmail, sendShippingNotificationEmail, sendAdminNotification } from "@/lib/email";
import { getFulfilledLots } from "./lots";
import { claimNotification } from "./notifications";
import { sendPaymentReceivedSms, sendOrderShippedSms } from "@/lib/sms";
import { getUserById } from "@/lib/users/store";
import { getContent, DEFAULT_NOTIFICATION_SETTINGS } from "@/lib/site-content";
import { logActivity } from "@/lib/activity-log";
import { isHumanVerified } from "@/lib/payments/methods";
import { getPaymentConfig } from "@/lib/payments/config";

// Every order transition (Stage 3). The state change and its stock movements happen in ONE database function call
// (scripts/stage3-sql.mjs), so they can't drift apart, can't run twice, and a concurrent second call sees the first
// one's result. This file adds what lives outside the database: emails/SMS, promo redemptions, the activity log.
//
// Payment status and fulfillment status are separate (orders.payment_status / fulfillment_status); the legacy
// orders.status is derived from them by the database.

export type Actor = { email: string };
const actorId = (a: Actor | string) => (typeof a === "string" ? a : `admin:${a.email}`);

type DbResult = { outcome: string; review?: string | null; [k: string]: unknown };
async function fn(sql: string, params: unknown[]): Promise<DbResult> {
  const [row] = await callDb<{ r: DbResult }>(sql, params);
  return row.r;
}

// --- Payment ---------------------------------------------------------------------------------------------------

export type ConfirmInput = {
  order: Order;
  actor: Actor | string;
  source: "admin" | "provider" | "simulated";
  reference: string;
  amount?: number;
  receivedOn?: string;
  note?: string;
  provider?: string;
  providerEventId?: string;
};

// Records a confirmed payment and moves stock in one call. Outcomes: confirmed · insufficient_stock (payment
// recorded, order in review, nothing deducted) · late_payment (reservation had expired: review, nothing held) ·
// amount_mismatch (NOT confirmed: review) · already_confirmed · duplicate_event · needs_review.
export async function confirmPayment(input: ConfirmInput): Promise<{ outcome: string; review?: string | null; order: Order | null }> {
  const { order } = input;
  const r = await fn(
    "SELECT vc_order_confirm_payment($1, $2, $3, $4, $5, $6::date, $7, $8, $9, $10, $11) AS r",
    [order.id, actorId(input.actor), input.source, input.reference, input.amount ?? null, input.receivedOn ?? null, input.note ?? null,
      // A person verifying a payment must see exactly the order total (owner decision Q3); providers report what settled.
      input.source === "admin" && isHumanVerified(order.paymentMethod),
      input.provider ?? null, input.providerEventId ?? null,
      // Ordered under a reserving policy: a payment with no live hold is a late payment.
      Boolean(order.reservationExpiresAt)]
  );
  const updated = await getOrderById(order.id);
  if (updated && ["confirmed", "insufficient_stock", "late_payment"].includes(r.outcome)) await afterPaymentConfirmed(updated);
  if (typeof input.actor !== "string") {
    await logActivity(input.actor.email, `order.payment_${r.outcome}`, `${order.reference} — reference ${input.reference}${input.amount !== undefined ? `, $${input.amount.toFixed(2)}` : ""}`);
  }
  return { outcome: r.outcome, review: r.review ?? null, order: updated };
}

async function afterPaymentConfirmed(updated: Order) {
  // Stage 3 final corrections: an order whose payment is recorded but which can't go to fulfillment (Administrative
  // Review) gets the "payment received, completing a check before shipping" message INSTEAD of "your order is now
  // processing". Each is sent at most once (claimNotification); the "processing" one follows a hold only once the
  // hold is resolved and stock is allocated (allocateNow / notifyIfAllocated).
  if (updated.needsReview && updated.fulfillmentStatus === "unfulfilled") {
    await notifyPaymentHold(updated);
  } else {
    await notifyIfAllocated(updated);
  }
  if (await claimNotification(updated.id, `payment-sms:${updated.id}:${updated.paymentConfirmedAt}`, "payment_received_sms")) {
    // The SMS only says the payment was received, which is true either way.
    notifyOrderSms(updated, (phone) => sendPaymentReceivedSms(phone, updated.reference, updated.total)).catch((err) =>
      console.error("Failed to send payment received SMS:", err)
    );
  }
  // Only counted against usage/per-customer limits once payment is confirmed (idempotent per order).
  if (updated.promoCodeId) {
    await recordRedemption({
      promoCodeId: updated.promoCodeId,
      orderId: updated.id,
      customerId: updated.customerId,
      discountAmount: updated.discountAmount ?? 0,
    });
  }
  notifyLowStockIfNeeded().catch((err) => console.error("Failed to send low-stock admin notification:", err));
  if (updated.needsReview) notifyReview(updated).catch((err) => console.error("Failed to send review notification:", err));
}

// "Payment confirmed — your order is now processing", once, when the order's stock is allocated.
async function notifyIfAllocated(order: Order) {
  if (order.fulfillmentStatus !== "allocated" || !order.paymentConfirmedAt) return;
  if (!(await claimNotification(order.id, `payment-confirmed:${order.id}:${order.paymentConfirmedAt}`, "payment_confirmed"))) return;
  const lots = await getFulfilledLots(order.id);
  sendPaymentConfirmedEmail(order, lots).catch((err) => console.error("Failed to send payment confirmation email:", err));
}

// Owner decision D5 (2026-11-18): a lot losing approval put these unshipped orders on hold (vc_lot_update). Each
// customer whose payment was RECEIVED gets the same once-only hold message as any other hold — payment received,
// shipping held pending a check — with nothing about the lot, quarantine or the reason. (An ACH payment still
// "processing" has not been received, so that customer is not told it was.)
export async function notifyLotHolds(orderIds: string[]): Promise<number> {
  let sent = 0;
  for (const id of orderIds) {
    const order = await getOrderById(id);
    if (!order?.needsReview || !(order.paymentStatus === "confirmed" || order.paymentStatus === "partially_refunded")) continue;
    if (await notifyPaymentHold(order)) sent++;
    notifyReview(order).catch(() => {});
  }
  return sent;
}

// "Payment received — completing a check before shipping", once per review.
async function notifyPaymentHold(order: Order): Promise<boolean> {
  if (!(await claimNotification(order.id, `payment-hold:${order.id}:${order.reviewOpenedAt}`, "payment_received_hold"))) return false;
  sendPaymentHoldEmail(order).catch((err) => console.error("Failed to send payment hold email:", err));
  return true;
}

// The legacy Coinbase paths (webhook, order-page reconciliation) call this. Same function as any provider.
export async function markOrderPaid(order: Order, providerEventId?: string): Promise<Order | null> {
  const r = await confirmPayment({ order, actor: "provider:coinbase", source: "provider", reference: order.crypto?.chargeCode ?? order.reference,
    provider: "coinbase", providerEventId });
  return r.order;
}

// Provider updates that aren't a confirmation: processing (e.g. ACH initiated), failed, reversed (ACH return /
// chargeback). A reversal never restores stock.
export async function applyPaymentUpdate(order: Order, kind: "processing" | "failed" | "reversed", opts: {
  actor: string; source: "provider" | "simulated"; provider: string; providerEventId?: string; details?: Record<string, unknown>;
}): Promise<{ outcome: string; review?: string | null }> {
  const r = await fn("SELECT vc_order_payment_update($1, $2, $3, $4, $5, $6, $7::jsonb) AS r",
    [order.id, kind, opts.actor, opts.source, opts.provider, opts.providerEventId ?? null, JSON.stringify(opts.details ?? {})]);
  // ACH configured to fulfil on initiation: deduct now (FIFO from approved lots) — or send the order to review.
  if (r.outcome === "processing" && order.paymentMethod === "ach" && (await getPaymentConfig()).achFulfillment === "after_initiation") {
    try {
      await fn("SELECT vc_order_allocate_now($1, $2, TRUE) AS r", [order.id, "system:ach-after-initiation"]);
    } catch (err) {
      if (!(err instanceof InventoryError)) throw err;
      await openReview(order, `ACH initiated but stock could not be allocated: ${err.message}`, "system:ach-after-initiation");
    }
  }
  const updated = await getOrderById(order.id);
  if (updated?.needsReview) notifyReview(updated).catch(() => {});
  return { outcome: r.outcome, review: r.review ?? null };
}

// Voids an administrator's confirmation (owner decision Q4): before shipment only; stock goes back to its lots, the
// order returns to awaiting payment, and the original confirmation stays in the order history.
export async function voidPaymentConfirmation(order: Order, actor: Actor, reason: string): Promise<Order | null> {
  await fn("SELECT vc_order_void_payment($1, $2, $3) AS r", [order.id, actorId(actor), reason]);
  if (order.promoCodeId) await removeRedemptionForOrder(order.id);
  await logActivity(actor.email, "order.payment_voided", `${order.reference} — ${order.paymentReference ?? "no reference"}: ${reason}`);
  return getOrderById(order.id);
}

// --- Fulfillment -------------------------------------------------------------------------------------------------

export type AdvanceOptions = { carrier?: string; trackingNumber?: string; actor?: Actor };

// allocated → processing → shipped → delivered. Shipping needs confirmed payment (or ACH processing under "fulfil
// after initiation"), no open review, a tracking number, and every lot it was filled from still approved.
export async function advanceOrderStatus(order: Order, next: "processing" | "shipped" | "delivered", opts: AdvanceOptions = {}): Promise<Order | null> {
  const allowProcessing = order.paymentMethod === "ach" && (await getPaymentConfig()).achFulfillment === "after_initiation";
  const r = await fn("SELECT vc_order_advance($1, $2, $3, $4, $5, $6) AS r",
    [order.id, next, opts.actor ? actorId(opts.actor) : "system", opts.carrier ?? null, opts.trackingNumber ?? null, allowProcessing]);
  const updated = await getOrderById(order.id);
  if (updated && next === "shipped" && r.outcome === "shipped") {
    const lots = await getFulfilledLots(updated.id);
    sendShippingNotificationEmail(updated, lots).catch((err) => console.error("Failed to send shipping notification email:", err));
    notifyOrderSms(updated, (phone) => sendOrderShippedSms(phone, updated.reference)).catch((err) =>
      console.error("Failed to send shipping notification SMS:", err)
    );
  }
  return updated;
}

// Cancels an order (until shipment): releases holds and puts deducted units back into their lots.
export async function cancelOrder(order: Order, reason: string | undefined, actor: Actor | string = "system", source: "admin" | "customer" | "system" = "admin"): Promise<Order | null> {
  await fn("SELECT vc_order_cancel($1, $2, $3, $4) AS r", [order.id, actorId(actor), source, reason ?? null]);
  if (order.promoCodeId) await removeRedemptionForOrder(order.id);
  return getOrderById(order.id);
}

// Records ONE refund (Stage 3 final corrections). Refunds accumulate; their total can never exceed what was paid.
// Below the amount paid the payment is "partially refunded" and nothing else changes. The refund that completes it
// makes the payment "refunded" and — owner decision Q1 — cancels an unshipped order and restores its stock; after
// shipment no stock changes (returns only). Blank amount = the remaining balance. A repeated submission (same key)
// is recorded once. The promo redemption is removed only when the order is fully refunded.
export async function refundOrder(
  order: Order,
  reason: RefundReasonCode,
  opts: { amount?: number; note?: string; actor?: Actor; idempotencyKey?: string } = {}
): Promise<{ order: Order | null; result: DbResult }> {
  const result = await fn("SELECT vc_order_refund($1, $2, $3, $4::numeric, $5, $6) AS r",
    [order.id, opts.actor ? actorId(opts.actor) : "system", reason, opts.amount ?? null, opts.note ?? null,
      opts.idempotencyKey ? `admin:${opts.idempotencyKey}` : null]);
  if (result.outcome === "refunded" && order.promoCodeId) await removeRedemptionForOrder(order.id);
  return { order: await getOrderById(order.id), result };
}

// Controlled reallocation (Stage 3 final corrections): moves an unshipped order's units off lots that are no longer
// eligible onto approved lots of the same strength, atomically, with the reason and administrator recorded. If
// approved stock can't cover it nothing moves and the order is held in Administrative Review — and the customer is
// told (once) that payment was received and a check is being completed.
export async function reallocateOrder(order: Order, actor: Actor, reason: string): Promise<{ order: Order | null; result: DbResult }> {
  const result = await fn("SELECT vc_order_reallocate($1, $2, $3) AS r", [order.id, actorId(actor), reason]);
  await logActivity(actor.email, `order.reallocation_${result.outcome}`, `${order.reference} — ${reason}`);
  const updated = await getOrderById(order.id);
  if (updated && result.outcome === "on_hold") {
    await notifyPaymentHold(updated);
    notifyReview(updated).catch(() => {});
  }
  return { order: updated, result };
}

export async function recordReturn(order: Order, input: {
  lineIndex: number; allocationId?: string; quantity: number; condition: string; decision: "restock" | "quarantine" | "discard";
  reason: string; idempotencyKey: string; actor: Actor;
}) {
  const r = await fn("SELECT vc_order_return($1, $2, $3, $4, $5, $6, $7, $8, $9) AS r",
    [order.id, input.lineIndex, input.allocationId ?? null, input.quantity, input.condition, input.decision, actorId(input.actor), input.reason,
      `admin:${input.idempotencyKey}`]);
  await logActivity(input.actor.email, "order.return_recorded", `${order.reference} — ${input.quantity} unit(s), ${r.decision ?? input.decision}`);
  return r;
}

// --- Administrative review -----------------------------------------------------------------------------------------

// Resolution 1: try to deduct stock now (FIFO from approved lots). Clears the review on success; refuses (409) with
// nothing changed if there still isn't enough.
export async function allocateNow(order: Order, actor: Actor): Promise<Order | null> {
  const allowProcessing = order.paymentMethod === "ach" && (await getPaymentConfig()).achFulfillment === "after_initiation";
  await fn("SELECT vc_order_allocate_now($1, $2, $3) AS r", [order.id, actorId(actor), allowProcessing]);
  await logActivity(actor.email, "order.stock_allocated", order.reference);
  const updated = await getOrderById(order.id);
  // The hold is over: now (and only now) the customer gets "payment confirmed — your order is processing".
  if (updated) await notifyIfAllocated(updated);
  return updated;
}

// Resolution 2: close the review with a written note (e.g. after refunding, or after confirming with the customer).
export async function closeReview(order: Order, actor: Actor, note: string): Promise<Order | null> {
  if (!order.needsReview) throw new InventoryError("This order has no open review.", 409, "invalid_state");
  await transaction([
    { text: "UPDATE orders SET needs_review = FALSE, review_reason = NULL, review_opened_at = NULL WHERE id = $1 AND needs_review", params: [order.id] },
    {
      text: "SELECT vc_order_event($1, 'review_closed', $2, 'admin', payment_status, payment_status, fulfillment_status, fulfillment_status, $3::jsonb) FROM orders WHERE id = $1",
      params: [order.id, actorId(actor), JSON.stringify({ note, previous_review: order.reviewReason })],
    },
  ]);
  await logActivity(actor.email, "order.review_closed", `${order.reference} — ${note}`);
  return getOrderById(order.id);
}

async function openReview(order: Order, reason: string, actor: string) {
  await transaction([
    { text: "UPDATE orders SET needs_review = TRUE, review_reason = $2, review_opened_at = $3 WHERE id = $1", params: [order.id, reason, new Date().toISOString()] },
    {
      text: "SELECT vc_order_event($1, 'review_opened', $2, 'system', payment_status, payment_status, fulfillment_status, fulfillment_status, $3::jsonb) FROM orders WHERE id = $1",
      params: [order.id, actor, JSON.stringify({ reason })],
    },
  ]);
}

// --- Order detail for the Executive Office ---------------------------------------------------------------------------
export type OrderEvent = {
  id: string; type: string; actor: string; source: string; paymentBefore: string | null; paymentAfter: string | null;
  fulfillmentBefore: string | null; fulfillmentAfter: string | null; details: Record<string, unknown>; provider: string | null;
  providerEventId: string | null; createdAt: string;
};
export type OrderAllocation = {
  id: string; lineIndex: number; strengthId: string; sku: string; lotId: string; lotCode: string; quantity: number; state: string;
  expiresAt: string | null; returnedQuantity: number; createdAt: string; committedAt: string | null; releasedAt: string | null;
  releasedBy: string | null; releaseReason: string | null; restoredAt: string | null; restoredBy: string | null;
  lotReleaseStatus: string; lotTestingStatus: string; manufacturerLot: string | null; vericertLotNumber: string | null;
};
export type OrderReturn = {
  id: string; lineIndex: number; allocationId: string | null; quantity: number; condition: string; decision: string; reason: string;
  decidedBy: string; createdAt: string; fromLot: string | null; toLot: string | null;
};

export async function getOrderDetail(orderId: string) {
  const order = await getOrderById(orderId);
  if (!order) return null;
  const [events, allocations, returns] = await Promise.all([
    query<Record<string, string>>("SELECT * FROM order_events WHERE order_id = $1 ORDER BY created_at, id", [orderId]),
    query<Record<string, string>>(
      `SELECT a.*, l.release_status, l.testing_status, l.manufacturer_lot, l.vericert_lot_number
         FROM inventory_allocations a JOIN inventory_lots l ON l.id = a.lot_id WHERE a.order_id = $1 ORDER BY a.line_index, a.created_at`, [orderId]),
    query<Record<string, string>>(
      `SELECT r.*, fl.lot_code AS from_lot, tl.lot_code AS to_lot FROM order_returns r
         LEFT JOIN inventory_lots fl ON fl.id = r.from_lot_id LEFT JOIN inventory_lots tl ON tl.id = r.to_lot_id
        WHERE r.order_id = $1 ORDER BY r.created_at`, [orderId]),
  ]);
  const parse = (v: unknown) => (typeof v === "string" ? JSON.parse(v) : (v ?? {}));
  return {
    order,
    events: events.map((e): OrderEvent => ({
      id: e.id, type: e.event_type, actor: e.actor, source: e.source, paymentBefore: e.payment_status_before, paymentAfter: e.payment_status_after,
      fulfillmentBefore: e.fulfillment_status_before, fulfillmentAfter: e.fulfillment_status_after, details: parse(e.details),
      provider: e.provider, providerEventId: e.provider_event_id, createdAt: e.created_at,
    })),
    allocations: allocations.map((a): OrderAllocation => ({
      id: a.id, lineIndex: Number(a.line_index), strengthId: a.strength_id, sku: a.sku, lotId: a.lot_id, lotCode: a.lot_code, quantity: Number(a.quantity),
      state: a.state, expiresAt: a.expires_at, returnedQuantity: Number(a.returned_quantity), createdAt: a.created_at, committedAt: a.committed_at,
      releasedAt: a.released_at, releasedBy: a.released_by, releaseReason: a.release_reason, restoredAt: a.restored_at, restoredBy: a.restored_by,
      lotReleaseStatus: a.release_status, lotTestingStatus: a.testing_status, manufacturerLot: a.manufacturer_lot, vericertLotNumber: a.vericert_lot_number,
    })),
    returns: returns.map((r): OrderReturn => ({
      id: r.id, lineIndex: Number(r.line_index), allocationId: r.allocation_id, quantity: Number(r.quantity), condition: r.condition, decision: r.decision,
      reason: r.reason, decidedBy: r.decided_by, createdAt: r.created_at, fromLot: r.from_lot, toLot: r.to_lot,
    })),
  };
}

export const CANCELLABLE_FULFILLMENT: FulfillmentStatus[] = ["unfulfilled", "reserved", "allocated", "processing"];

// --- Notifications ---------------------------------------------------------------------------------------------------

// Only ever texts a customer who explicitly opted in with a phone number.
async function notifyOrderSms(order: Order, send: (phone: string) => Promise<void>): Promise<void> {
  if (!order.customerId) return;
  const user = await getUserById(order.customerId);
  if (user?.smsOptIn && user.phone) await send(user.phone);
}

async function notifyReview(order: Order): Promise<void> {
  const settings = await getContent("notification_settings", DEFAULT_NOTIFICATION_SETTINGS);
  if (!settings.emailAddress) return;
  await sendAdminNotification(settings.emailAddress, `Order ${order.reference} needs review`,
    `Order ${order.reference} was sent to Administrative Review:\n\n${order.reviewReason ?? "(no reason recorded)"}\n\nOpen it in the Executive Office → Orders.`);
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
