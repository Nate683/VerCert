import type { Order } from "@/lib/types";

// Client-safe. ONE rule for what an order contributes to revenue (Stage 3 final corrections). Before this, every
// report excluded an order outright once any refund was recorded, so a partial refund removed the whole sale.
//
// - An order counts once paid, unless it was cancelled, fully refunded, or its payment was reversed.
// - It counts at its NET amount: the order total less everything refunded so far.
// - "Fully refunded": payment_status 'refunded' (Stage 3), or — for records with no Stage 3 status — a refund date
//   with no smaller refunded amount.
// Refunds are attributed to the sale's own date (paidAt), not to the date the refund was recorded.

export function refundedTotal(order: Pick<Order, "refundAmount" | "refundedAt" | "total" | "paymentStatus">): number {
  if (order.refundAmount !== undefined && order.refundAmount !== null) return Number(order.refundAmount);
  return order.refundedAt && order.paymentStatus !== "partially_refunded" ? order.total : 0;
}

export function isFullyRefunded(order: Pick<Order, "refundAmount" | "refundedAt" | "total" | "paymentStatus">): boolean {
  if (order.paymentStatus === "refunded") return true;
  if (order.paymentStatus === "partially_refunded") return false;
  return Boolean(order.refundedAt) && refundedTotal(order) >= order.total;
}

// A payment that was never received. The two owner-confirmed test orders (VC-E3SQJ9, VC-38UTPQ) are migrated to
// payment 'cancelled' but keep the paid_at Stage 2 recorded, so paidAt alone must not make an order revenue.
const NOT_RECEIVED = new Set(["cancelled", "failed", "expired"]);
export function paymentNotReceived(order: Pick<Order, "paymentStatus">): boolean {
  return order.paymentStatus !== undefined && NOT_RECEIVED.has(order.paymentStatus);
}

export function countsAsRevenue(order: Order): boolean {
  return Boolean(order.paidAt) && !paymentNotReceived(order) && order.status !== "cancelled" && order.paymentStatus !== "reversed" && !isFullyRefunded(order);
}

export function netRevenue(order: Order): number {
  return Math.max(0, Math.round((order.total - refundedTotal(order)) * 100) / 100);
}

// Affiliate commission keeps its pre-Stage-3 rule — ANY refund removes the order from commission — until the owner
// decides how commission should treat a partial refund (open decision in the Stage 3 report).
export function qualifiesForCommission(order: Order): boolean {
  return Boolean(order.paidAt) && !paymentNotReceived(order) && order.status !== "cancelled" && order.paymentStatus !== "reversed" && refundedTotal(order) === 0 && !order.refundedAt;
}
