import type { AffiliateSummary, Order, Product, PromoCode } from "@/lib/types";

// Orders qualify for revenue recognition once paid and never
// cancelled/refunded — the same rule used by stats.ts and affiliates/stats.ts.
function isQualifying(order: Order): boolean {
  return Boolean(order.paidAt) && order.status !== "cancelled" && !order.refundedAt;
}

export type PeriodRevenue = {
  current: number;
  prior: number;
  changePercent: number | null; // null when there's no prior-period revenue to compare against
};

export type ProductMargin = {
  slug: string;
  name: string;
  revenue: number;
  cost: number;
  margin: number;
  marginPercent: number | null; // null when the product has no cost entered
};

export type FinancialSummary = {
  revenue: {
    today: PeriodRevenue;
    wtd: PeriodRevenue;
    mtd: PeriodRevenue;
    qtd: PeriodRevenue;
    ytd: PeriodRevenue;
    allTime: number;
  };
  grossRevenue: number;
  discountsGiven: number;
  commissionsOwed: number;
  netRevenue: number;
  averageOrderValue: number;
  repeatPurchaseRate: number;
  customerLifetimeValue: number;
  cash: { paid: number; awaitingPayment: number; refunded: number };
  marginByProduct: ProductMargin[];
  blendedMarginPercent: number | null;
  revenueByCategory: { category: string; revenue: number }[];
  revenueByPromoCode: { code: string; revenue: number; discountGiven: number }[];
  revenueByAffiliate: { name: string; revenue: number }[];
};

function sumInRange(orders: Order[], start: Date, end: Date): number {
  return orders
    .filter((o) => {
      const paidAt = new Date(o.paidAt!);
      return paidAt >= start && paidAt < end;
    })
    .reduce((sum, o) => sum + o.total, 0);
}

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function startOfWeek(d: Date) {
  const x = startOfDay(d);
  x.setDate(x.getDate() - x.getDay());
  return x;
}
function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function startOfQuarter(d: Date) {
  const q = Math.floor(d.getMonth() / 3);
  return new Date(d.getFullYear(), q * 3, 1);
}
function startOfYear(d: Date) {
  return new Date(d.getFullYear(), 0, 1);
}

function periodRevenue(
  orders: Order[],
  currentStart: Date,
  currentEnd: Date,
  priorStart: Date,
  priorEnd: Date
): PeriodRevenue {
  const current = sumInRange(orders, currentStart, currentEnd);
  const prior = sumInRange(orders, priorStart, priorEnd);
  return { current, prior, changePercent: prior > 0 ? ((current - prior) / prior) * 100 : null };
}

export function computeFinancials(
  orders: Order[],
  products: Product[],
  promoCodes: PromoCode[],
  affiliateSummaries: AffiliateSummary[]
): FinancialSummary {
  const now = new Date();
  const paid = orders.filter(isQualifying);

  const dayStart = startOfDay(now);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
  const priorDayStart = new Date(dayStart.getTime() - 24 * 60 * 60 * 1000);

  const weekStart = startOfWeek(now);
  const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);
  const priorWeekStart = new Date(weekStart.getTime() - 7 * 24 * 60 * 60 * 1000);

  const monthStart = startOfMonth(now);
  const nextMonthStart = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1);
  const priorMonthStart = new Date(monthStart.getFullYear(), monthStart.getMonth() - 1, 1);

  const quarterStart = startOfQuarter(now);
  const nextQuarterStart = new Date(quarterStart.getFullYear(), quarterStart.getMonth() + 3, 1);
  const priorQuarterStart = new Date(quarterStart.getFullYear(), quarterStart.getMonth() - 3, 1);

  const yearStart = startOfYear(now);
  const nextYearStart = new Date(yearStart.getFullYear() + 1, 0, 1);
  const priorYearStart = new Date(yearStart.getFullYear() - 1, 0, 1);

  const revenue = {
    today: periodRevenue(paid, dayStart, dayEnd, priorDayStart, dayStart),
    wtd: periodRevenue(paid, weekStart, weekEnd, priorWeekStart, weekStart),
    mtd: periodRevenue(paid, monthStart, nextMonthStart, priorMonthStart, monthStart),
    qtd: periodRevenue(paid, quarterStart, nextQuarterStart, priorQuarterStart, quarterStart),
    ytd: periodRevenue(paid, yearStart, nextYearStart, priorYearStart, yearStart),
    allTime: paid.reduce((sum, o) => sum + o.total, 0),
  };

  const grossRevenue = paid.reduce((sum, o) => sum + o.subtotal, 0);
  const discountsGiven = paid.reduce((sum, o) => sum + (o.discountAmount ?? 0), 0);
  const commissionsOwed = affiliateSummaries.reduce((sum, a) => sum + a.balanceOwed, 0);
  const netRevenue = revenue.allTime - commissionsOwed;
  const averageOrderValue = paid.length > 0 ? revenue.allTime / paid.length : 0;

  const ordersByCustomer = new Map<string, number>();
  for (const o of paid) {
    if (!o.customerId) continue;
    ordersByCustomer.set(o.customerId, (ordersByCustomer.get(o.customerId) ?? 0) + 1);
  }
  const customersWithOrders = ordersByCustomer.size;
  const repeatCustomers = [...ordersByCustomer.values()].filter((c) => c > 1).length;
  const repeatPurchaseRate = customersWithOrders > 0 ? (repeatCustomers / customersWithOrders) * 100 : 0;
  const customerLifetimeValue = customersWithOrders > 0 ? revenue.allTime / customersWithOrders : 0;

  const cash = {
    paid: revenue.allTime,
    awaitingPayment: orders
      .filter((o) => o.status === "awaiting_payment")
      .reduce((sum, o) => sum + o.total, 0),
    refunded: orders.filter((o) => o.refundedAt).reduce((sum, o) => sum + (o.refundAmount ?? o.total), 0),
  };

  const productAgg = new Map<string, { revenue: number; unitsSold: number }>();
  for (const o of paid) {
    for (const item of o.items) {
      const entry = productAgg.get(item.slug) ?? { revenue: 0, unitsSold: 0 };
      entry.revenue += item.priceUsd * item.quantity;
      entry.unitsSold += item.quantity;
      productAgg.set(item.slug, entry);
    }
  }
  const marginByProduct: ProductMargin[] = [...productAgg.entries()]
    .map(([slug, agg]) => {
      const product = products.find((p) => p.slug === slug);
      const hasCost = product?.costUsd !== undefined;
      const cost = hasCost ? product!.costUsd! * agg.unitsSold : 0;
      const margin = agg.revenue - cost;
      return {
        slug,
        name: product?.name ?? slug,
        revenue: agg.revenue,
        cost,
        margin,
        marginPercent: hasCost && agg.revenue > 0 ? (margin / agg.revenue) * 100 : null,
      };
    })
    .sort((a, b) => b.revenue - a.revenue);

  const costed = marginByProduct.filter((p) => p.marginPercent !== null);
  const costedRevenue = costed.reduce((sum, p) => sum + p.revenue, 0);
  const costedCost = costed.reduce((sum, p) => sum + p.cost, 0);
  const blendedMarginPercent = costedRevenue > 0 ? ((costedRevenue - costedCost) / costedRevenue) * 100 : null;

  const categoryAgg = new Map<string, number>();
  for (const [slug, agg] of productAgg.entries()) {
    const category = products.find((p) => p.slug === slug)?.category ?? "Unknown";
    categoryAgg.set(category, (categoryAgg.get(category) ?? 0) + agg.revenue);
  }
  const revenueByCategory = [...categoryAgg.entries()]
    .map(([category, revenue]) => ({ category, revenue }))
    .sort((a, b) => b.revenue - a.revenue);

  const promoAgg = new Map<string, { revenue: number; discount: number }>();
  for (const o of paid) {
    if (!o.promoCodeId) continue;
    const entry = promoAgg.get(o.promoCodeId) ?? { revenue: 0, discount: 0 };
    entry.revenue += o.total;
    entry.discount += o.discountAmount ?? 0;
    promoAgg.set(o.promoCodeId, entry);
  }
  const revenueByPromoCode = [...promoAgg.entries()]
    .map(([id, agg]) => ({
      code: promoCodes.find((p) => p.id === id)?.code ?? id,
      revenue: agg.revenue,
      discountGiven: agg.discount,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  const revenueByAffiliate = affiliateSummaries
    .filter((a) => a.grossRevenue > 0)
    .map((a) => ({ name: a.name, revenue: a.grossRevenue }))
    .sort((a, b) => b.revenue - a.revenue);

  return {
    revenue,
    grossRevenue,
    discountsGiven,
    commissionsOwed,
    netRevenue,
    averageOrderValue,
    repeatPurchaseRate,
    customerLifetimeValue,
    cash,
    marginByProduct,
    blendedMarginPercent,
    revenueByCategory,
    revenueByPromoCode,
    revenueByAffiliate,
  };
}
