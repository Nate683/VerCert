import type { Alert } from "@/lib/types";
import { getLowInventoryAlerts } from "@/lib/inventory";
import { listOrders } from "@/lib/orders/store";
import { listAffiliates, getAllPayouts, computeAffiliateSummaries } from "@/lib/affiliates";
import { listPromoCodes } from "@/lib/promotions";

const STUCK_PAYMENT_HOURS = 48;
const RECENT_DAYS = 7;

// Every alert is computed live from existing data at read time — nothing
// here is persisted, so there's no dismissal/acknowledgment state to manage.
export async function computeAlerts(): Promise<Alert[]> {
  const [lowStock, orders, affiliates, promoCodes, payouts] = await Promise.all([
    getLowInventoryAlerts(),
    listOrders(),
    listAffiliates(),
    listPromoCodes(),
    getAllPayouts(),
  ]);

  const alerts: Alert[] = [];
  const now = Date.now();
  const recentCutoff = now - RECENT_DAYS * 24 * 60 * 60 * 1000;
  const stuckCutoff = now - STUCK_PAYMENT_HOURS * 60 * 60 * 1000;

  for (const item of lowStock) {
    alerts.push({
      id: `low_stock:${item.slug}`,
      severity: item.quantity === 0 ? "critical" : "warning",
      category: "low_stock",
      message: `${item.name} — ${item.quantity} unit(s) left (threshold ${item.threshold}).`,
      createdAt: new Date().toISOString(),
    });
  }

  for (const order of orders) {
    if (order.status === "awaiting_payment" && new Date(order.createdAt).getTime() < stuckCutoff) {
      alerts.push({
        id: `failed_payment:${order.id}`,
        severity: "warning",
        category: "failed_payment",
        message: `Order ${order.reference} still awaiting payment after ${STUCK_PAYMENT_HOURS}h — $${order.total.toFixed(2)}.`,
        createdAt: order.createdAt,
      });
    }
    if (order.refundedAt && new Date(order.refundedAt).getTime() > recentCutoff) {
      alerts.push({
        id: `unusual_activity:refund:${order.id}`,
        severity: "info",
        category: "unusual_activity",
        message: `Order ${order.reference} was refunded — $${(order.refundAmount ?? order.total).toFixed(2)}.`,
        createdAt: order.refundedAt,
      });
    }
    if (order.cancelledAt && new Date(order.cancelledAt).getTime() > recentCutoff) {
      alerts.push({
        id: `unusual_activity:cancel:${order.id}`,
        severity: "info",
        category: "unusual_activity",
        message: `Order ${order.reference} was cancelled${order.cancelReason ? ` (${order.cancelReason})` : ""}.`,
        createdAt: order.cancelledAt,
      });
    }
  }

  const summaries = computeAffiliateSummaries(affiliates, orders, promoCodes, payouts);
  for (const summary of summaries) {
    if (summary.active && summary.balanceOwed > 0) {
      alerts.push({
        id: `pending_payout:${summary.id}`,
        severity: summary.balanceOwed > 500 ? "warning" : "info",
        category: "pending_payout",
        message: `${summary.name} is owed $${summary.balanceOwed.toFixed(2)} in unpaid commission.`,
        createdAt: new Date().toISOString(),
      });
    }
  }

  const severityRank = { critical: 0, warning: 1, info: 2 };
  return alerts.sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);
}
