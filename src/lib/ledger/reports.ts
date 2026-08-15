import type {
  CogsEntry,
  Expense,
  LedgerAsset,
  LedgerLiability,
  Order,
  OwnerTransaction,
  Product,
  PromoCode,
  AffiliateSummary,
} from "@/lib/types";
import { computeFinancials } from "@/lib/executive/financials";

export type DateRange = { start: Date; end: Date };

export type LedgerReports = {
  range: { start: string; end: string };
  // Revenue-side figures for the selected range (reuses the same
  // paid/not-cancelled/not-refunded qualification as the rest of the app).
  revenue: number;
  discountsGiven: number;
  commissionsOwed: number;
  cogs: number;
  operatingExpenses: number;
  grossProfit: number;
  netIncome: number;
  marginByProduct: ReturnType<typeof computeFinancials>["marginByProduct"];
  blendedMarginPercent: number | null;
  expenseByCategory: { category: string; amount: number }[];
  cashFlowByMonth: { month: string; inflow: number; outflow: number; net: number }[];
  balanceSheet: {
    assetsByType: { type: string; total: number }[];
    assetsTotal: number;
    liabilitiesByType: { type: string; total: number }[];
    liabilitiesTotal: number;
    equity: number;
  };
  ownerContributions: number;
  ownerDraws: number;
};

function inRange(dateStr: string, range: DateRange): boolean {
  const d = new Date(dateStr);
  return d >= range.start && d < range.end;
}

function isQualifyingOrder(order: Order): boolean {
  return Boolean(order.paidAt) && order.status !== "cancelled" && !order.refundedAt;
}

export function computeLedgerReports(
  range: DateRange,
  orders: Order[],
  products: Product[],
  promoCodes: PromoCode[],
  affiliateSummaries: AffiliateSummary[],
  expenses: Expense[],
  cogsEntries: CogsEntry[],
  assets: LedgerAsset[],
  liabilities: LedgerLiability[],
  ownerTransactions: OwnerTransaction[]
): LedgerReports {
  const financials = computeFinancials(orders, products, promoCodes, affiliateSummaries);

  const ordersInRange = orders.filter((o) => isQualifyingOrder(o) && inRange(o.paidAt!, range));
  const revenue = ordersInRange.reduce((sum, o) => sum + o.total, 0);
  const discountsGiven = ordersInRange.reduce((sum, o) => sum + (o.discountAmount ?? 0), 0);
  // Commissions owed is a point-in-time balance (not period-scoped) — always
  // the current total across all affiliates, same figure shown in Financials.
  const commissionsOwed = financials.commissionsOwed;

  const expensesInRange = expenses.filter((e) => inRange(e.date, range));
  const operatingExpenses = expensesInRange.reduce((sum, e) => sum + e.amount, 0);

  const cogsInRange = cogsEntries.filter((c) => inRange(c.dateReceived, range));
  // COGS here is purchase-basis (cost of inventory acquired in the period),
  // not matched to units actually sold — a deliberate simplification without
  // per-unit batch tracking through the order pipeline.
  const cogs = cogsInRange.reduce((sum, c) => sum + c.purchasePriceUsd * c.quantity, 0);

  const grossProfit = revenue - cogs;
  const netIncome = grossProfit - operatingExpenses - commissionsOwed;

  const categoryTotals = new Map<string, number>();
  for (const e of expensesInRange) {
    categoryTotals.set(e.category, (categoryTotals.get(e.category) ?? 0) + e.amount);
  }
  const expenseByCategory = [...categoryTotals.entries()]
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);

  // Rolling 12-month cash flow ending at the range's end month.
  const cashFlowByMonth: { month: string; inflow: number; outflow: number; net: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const monthDate = new Date(range.end.getFullYear(), range.end.getMonth() - i, 1);
    const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 1);
    const inflow =
      orders
        .filter((o) => isQualifyingOrder(o) && new Date(o.paidAt!) >= monthDate && new Date(o.paidAt!) < monthEnd)
        .reduce((sum, o) => sum + o.total, 0) +
      ownerTransactions
        .filter((t) => t.type === "contribution" && new Date(t.date) >= monthDate && new Date(t.date) < monthEnd)
        .reduce((sum, t) => sum + t.amountUsd, 0);
    const outflow =
      expenses
        .filter((e) => new Date(e.date) >= monthDate && new Date(e.date) < monthEnd)
        .reduce((sum, e) => sum + e.amount, 0) +
      cogsEntries
        .filter((c) => new Date(c.dateReceived) >= monthDate && new Date(c.dateReceived) < monthEnd)
        .reduce((sum, c) => sum + c.purchasePriceUsd * c.quantity, 0) +
      ownerTransactions
        .filter((t) => t.type === "draw" && new Date(t.date) >= monthDate && new Date(t.date) < monthEnd)
        .reduce((sum, t) => sum + t.amountUsd, 0);
    cashFlowByMonth.push({
      month: monthDate.toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
      inflow,
      outflow,
      net: inflow - outflow,
    });
  }

  const assetTypeTotals = new Map<string, number>();
  for (const a of assets) assetTypeTotals.set(a.type, (assetTypeTotals.get(a.type) ?? 0) + a.valueUsd);
  const assetsByType = [...assetTypeTotals.entries()].map(([type, total]) => ({ type, total }));
  const assetsTotal = assets.reduce((sum, a) => sum + a.valueUsd, 0);

  const liabilityTypeTotals = new Map<string, number>();
  for (const l of liabilities) liabilityTypeTotals.set(l.type, (liabilityTypeTotals.get(l.type) ?? 0) + l.valueUsd);
  const liabilitiesByType = [...liabilityTypeTotals.entries()].map(([type, total]) => ({ type, total }));
  const liabilitiesTotal = liabilities.reduce((sum, l) => sum + l.valueUsd, 0);

  return {
    range: { start: range.start.toISOString(), end: range.end.toISOString() },
    revenue,
    discountsGiven,
    commissionsOwed,
    cogs,
    operatingExpenses,
    grossProfit,
    netIncome,
    marginByProduct: financials.marginByProduct,
    blendedMarginPercent: financials.blendedMarginPercent,
    expenseByCategory,
    cashFlowByMonth,
    balanceSheet: {
      assetsByType,
      assetsTotal,
      liabilitiesByType,
      liabilitiesTotal,
      equity: assetsTotal - liabilitiesTotal,
    },
    ownerContributions: ownerTransactions
      .filter((t) => t.type === "contribution" && inRange(t.date, range))
      .reduce((sum, t) => sum + t.amountUsd, 0),
    ownerDraws: ownerTransactions
      .filter((t) => t.type === "draw" && inRange(t.date, range))
      .reduce((sum, t) => sum + t.amountUsd, 0),
  };
}
