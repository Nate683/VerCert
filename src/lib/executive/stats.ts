import type { Order, Product } from "@/lib/types";

export type RevenuePoint = { date: string; revenue: number };

export type TopProduct = {
  slug: string;
  name: string;
  unitsSold: number;
  revenue: number;
};

export type ActivityEvent = {
  id: string;
  timestamp: string;
  message: string;
};

export type ExecutiveOverview = {
  revenueToday: number;
  revenueMtd: number;
  revenueAllTime: number;
  orderCount: number;
  averageOrderValue: number;
  pendingPaymentsCount: number;
  pendingPaymentsAmount: number;
  chartSeries: RevenuePoint[];
  topProducts: TopProduct[];
  recentActivity: ActivityEvent[];
};

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function isSameMonth(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

export function computeOverview(orders: Order[], products: Product[]): ExecutiveOverview {
  const now = new Date();
  // "Paid" for revenue purposes means the order has ever been paid and
  // wasn't subsequently cancelled — not just currently sitting in the
  // "paid" status, since paid orders move on to processing/shipped/delivered.
  const paidOrders = orders.filter((o) => o.paidAt && o.status !== "cancelled");

  let revenueToday = 0;
  let revenueMtd = 0;
  let revenueAllTime = 0;

  for (const order of paidOrders) {
    const paidAt = new Date(order.paidAt!);
    revenueAllTime += order.total;
    if (isSameMonth(paidAt, now)) revenueMtd += order.total;
    if (isSameDay(paidAt, now)) revenueToday += order.total;
  }

  const pending = orders.filter((o) => o.status === "awaiting_payment");
  const pendingPaymentsAmount = pending.reduce((sum, o) => sum + o.total, 0);

  const averageOrderValue = paidOrders.length > 0 ? revenueAllTime / paidOrders.length : 0;

  // Daily revenue for the last 14 days.
  const chartSeries: RevenuePoint[] = [];
  for (let i = 13; i >= 0; i--) {
    const day = new Date(now);
    day.setDate(day.getDate() - i);
    const dayRevenue = paidOrders
      .filter((o) => isSameDay(new Date(o.paidAt!), day))
      .reduce((sum, o) => sum + o.total, 0);
    chartSeries.push({
      date: day.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      revenue: dayRevenue,
    });
  }

  // Top products by revenue across paid orders.
  const productTotals = new Map<string, { unitsSold: number; revenue: number }>();
  for (const order of paidOrders) {
    for (const item of order.items) {
      const entry = productTotals.get(item.slug) ?? { unitsSold: 0, revenue: 0 };
      entry.unitsSold += item.quantity;
      entry.revenue += item.priceUsd * item.quantity;
      productTotals.set(item.slug, entry);
    }
  }
  const topProducts: TopProduct[] = Array.from(productTotals.entries())
    .map(([slug, totals]) => ({
      slug,
      name: products.find((p) => p.slug === slug)?.name ?? slug,
      ...totals,
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  // Recent activity derived from order creation/payment timestamps.
  const recentActivity: ActivityEvent[] = orders
    .flatMap((order) => {
      const events: ActivityEvent[] = [
        {
          id: `${order.id}-created`,
          timestamp: order.createdAt,
          message: `New ${order.paymentMethod === "crypto" ? "crypto" : "bank transfer"} order ${order.reference} — $${order.total.toFixed(2)}`,
        },
      ];
      if (order.paidAt) {
        events.push({
          id: `${order.id}-paid`,
          timestamp: order.paidAt,
          message: `Order ${order.reference} marked paid — $${order.total.toFixed(2)}`,
        });
      }
      return events;
    })
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, 20);

  return {
    revenueToday,
    revenueMtd,
    revenueAllTime,
    orderCount: orders.length,
    averageOrderValue,
    pendingPaymentsCount: pending.length,
    pendingPaymentsAmount,
    chartSeries,
    topProducts,
    recentActivity,
  };
}
